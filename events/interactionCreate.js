const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');
const { getRolePermissions, isStaffMember } = require('../utils/permissions.js');
const { detectTicketCategory, prepareTicketName } = require('../utils/ticketUtils.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            // Tratar comandos slash
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;

                await command.execute(interaction);
            }

            // Tratar seleção de categoria de ticket
            else if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
                await handleTicketCreation(interaction);
            }

            // Tratar botões do painel de controle
            else if (interaction.isButton()) {
                await handleTicketButtons(interaction);
            }

            // Tratar modais
            else if (interaction.isModalSubmit()) {
                await handleModalSubmit(interaction);
            }
        } catch (error) {
            console.error('Erro ao processar interação:', error);
        }
    }
};

async function handleTicketCreation(interaction) {
    const category = interaction.values[0];
    const categoryConfig = config.ticketCategories[category];
    
    if (!categoryConfig) {
        return interaction.reply({
            content: '❌ Categoria inválida selecionada.',
            flags: 64
        });
    }

    const guild = interaction.guild;
    const user = interaction.user;

    // Verificar se o usuário já tem 2 tickets abertos em QUALQUER categoria
    const existingTickets = guild.channels.cache.filter(channel => {
        if (channel.type !== ChannelType.GuildText) return false;
        
        // Verificar por padrão de nome com emoji
        for (const [cat, catConfig] of Object.entries(config.ticketCategories)) {
            if (channel.name === `${catConfig.emoji}${cat}-${user.username}` || 
                channel.name === `${cat}-${user.username}`) {
                return true;
            }
        }
        return false;
    });

    if (existingTickets.size >= 2) {
        const ticketList = existingTickets.map(channel => channel.toString()).join(', ');
        return interaction.reply({
            content: `❌ Você já possui 2 tickets abertos: ${ticketList}\n\nFeche um dos tickets antes de abrir um novo.`,
            flags: 64
        });
    }

    // Criar modal para descrição do ticket
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

    const modal = new ModalBuilder()
        .setCustomId(`ticket_creation_modal_${category}`)
        .setTitle(`🎫 Criar Ticket - ${categoryConfig.emoji} ${categoryConfig.name}`);

    const subjectInput = new TextInputBuilder()
        .setCustomId('ticket_subject_input')
        .setLabel('Descreva o assunto com poucas palavras')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Problema com login, dúvida sobre doação, reportar bug...')
        .setRequired(true)
        .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(subjectInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

function getRoleMentions(guild, allowedRoleNames) {
    const mentions = [];
    
    for (const roleName of allowedRoleNames) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role) {
            mentions.push(`<@&${role.id}>`);
        }
    }
    
    return mentions.length > 0 ? mentions.join(' ') : '';
}

async function handleTicketButtons(interaction) {
    const { customId } = interaction;
    const channel = interaction.channel;
    const user = interaction.user;
    const guild = interaction.guild;
    const member = interaction.member;

    // Verificar se é um botão de cancelar timer
    if (customId.startsWith('cancel_timer_')) {
        return await handleCancelTimer(interaction);
    }

    // Verificar se é um canal de ticket
    const { isTicketChannel } = require('../utils/permissions');
    const isTicket = isTicketChannel(channel);

    if (!isTicket) {
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
                content: '❌ Este painel só funciona em canais de ticket.',
                flags: 64
            });
        }
        return;
    }

    // Lista de funções que requerem permissão de staff
    const staffOnlyFunctions = [
        'ticket_claim',
        'ticket_add_member', 
        'ticket_notify_member',
        'ticket_rename',
        'ticket_timer'
    ];

    // Verificar se a função requer permissão de staff
    if (staffOnlyFunctions.includes(customId)) {
        if (!isStaffMember(member)) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: '❌ Apenas membros da staff podem usar esta função.',
                    flags: 64
                });
            }
            return;
        }
    }

    switch (customId) {
        case 'ticket_close_request':
            await handleCloseRequest(interaction);
            break;
        case 'ticket_claim':
            await handleClaimTicket(interaction);
            break;
        case 'ticket_add_member':
            await handleAddMember(interaction);
            break;
        case 'ticket_notify_member':
            await handleNotifyMember(interaction);
            break;
        case 'ticket_rename':
            await handleRenameTicket(interaction);
            break;
        case 'ticket_timer':
            await handleTicketTimer(interaction);
            break;
    }
}

async function handleCloseRequest(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const member = interaction.member;
    const channel = interaction.channel;
    
    // Verificar se é staff (tem permissão para gerenciar canais)
    const isStaff = member.permissions.has(PermissionFlagsBits.ManageChannels) ||
                   channel.permissionsFor(member).has(PermissionFlagsBits.ManageChannels);

    if (isStaff) {
        // Se for staff, abrir modal para motivo
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

        const modal = new ModalBuilder()
            .setCustomId('close_ticket_modal')
            .setTitle('Fechar Ticket');

        const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason_input')
            .setLabel('Motivo do fechamento')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex: Problema resolvido, ticket duplicado, etc.')
            .setRequired(true)
            .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
    } else {
        // Se não for staff, apenas solicitar encerramento
        const embed = new EmbedBuilder()
            .setTitle('🔒 Solicitação de Encerramento')
            .setDescription(`${interaction.user} solicitou o encerramento deste ticket.`)
            .setColor(config.branding.errorColor)
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
}

async function handleClaimTicket(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const embed = new EmbedBuilder()
        .setTitle('✋ Ticket Assumido')
        .setDescription(`${interaction.user} assumiu este ticket e será responsável pelo atendimento.`)
        .setColor(config.branding.warningColor)
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleAddMember(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

    const modal = new ModalBuilder()
        .setCustomId('add_member_modal')
        .setTitle('Adicionar Membro ao Ticket');

    const userInput = new TextInputBuilder()
        .setCustomId('user_id_input')
        .setLabel('ID ou @menção do usuário')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678 ou @usuario')
        .setRequired(true);

    const row = new ActionRowBuilder().addComponents(userInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
}

async function handleNotifyMember(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const channel = interaction.channel;
    
    // Usar a função utilitária para detectar a categoria
    const { emoji: currentEmoji } = detectTicketCategory(channel.name);
    let channelName = channel.name;
    
    // Remover emoji se presente
    if (channelName.startsWith(currentEmoji)) {
        channelName = channelName.substring(currentEmoji.length);
    }
    
    const ticketOwner = channelName.split('-')[1];
    const member = interaction.guild.members.cache.find(m => m.user.username === ticketOwner);
    
    if (!member) {
        return interaction.reply({
            content: '❌ Não foi possível encontrar o usuário deste ticket.',
            flags: 64
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🔔 Aviso ao Membro')
        .setDescription(`${member.user}, você tem uma notificação da equipe no seu ticket.`)
        .addFields(
            { name: 'Notificado por', value: interaction.user.toString(), inline: true },
            { name: 'Canal', value: channel.toString(), inline: true }
        )
        .setColor(config.branding.warningColor)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    
    // Enviar notificação direta para o membro
    try {
        await member.send({
            content: `🔔 **Notificação do Ticket**\n\nVocê tem uma notificação da equipe no seu ticket: ${channel}\n\nAcesse o canal para ver mais detalhes.`
        });
    } catch (error) {
        console.error('Erro ao enviar DM:', error);
        await interaction.followUp({
            content: '⚠️ Não foi possível enviar notificação privada para o usuário.',
            flags: 64
        });
    }
}

async function handleRenameTicket(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const channel = interaction.channel;
    const oldName = channel.name;
    
    // Detectar a categoria do ticket atual usando a função utilitária
    const { category: currentCategory, emoji: currentEmoji } = detectTicketCategory(oldName);

    const modal = new ModalBuilder()
        .setCustomId('rename_ticket_modal')
        .setTitle(`Renomear Ticket - ${currentEmoji} ${config.ticketCategories[currentCategory].name}`);

    const nameInput = new TextInputBuilder()
        .setCustomId('new_name_input')
        .setLabel('Novo nome do ticket')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Ex: ${currentCategory}-usuario-problema-resolvido`)
        .setValue(oldName.startsWith(currentEmoji) ? oldName.substring(currentEmoji.length) : oldName)
        .setRequired(true)
        .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(nameInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
}

async function handleTicketTimer(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('⏰ Timer de 24 Horas Ativado')
        .setDescription(
            '**Atenção!** Este ticket será automaticamente fechado em **24 horas** se não houver resposta.\n\n' +
            '⚠️ **Importante:** Se você precisar de mais tempo, clique no botão abaixo para cancelar o timer.\n\n' +
            `⏱️ **Timer iniciado por:** ${interaction.user}\n` +
            `📅 **Data/Hora de fechamento:** <t:${Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000)}:F>`
        )
        .setColor(config.branding.warningColor)
        .setTimestamp();

    const cancelButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`cancel_timer_${interaction.channel.id}`)
                .setLabel('Cancelar Timer')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    await interaction.reply({
        embeds: [embed],
        components: [cancelButton]
    });

    // Configurar timer para fechar o ticket em 24 horas
    setTimeout(async () => {
        try {
            const channel = interaction.guild.channels.cache.get(interaction.channel.id);
            if (channel) {
                const closeEmbed = new EmbedBuilder()
                    .setTitle('⏰ Ticket Fechado Automaticamente')
                    .setDescription('Este ticket foi fechado automaticamente após 24 horas sem resposta.')
                    .setColor(config.branding.errorColor)
                    .setTimestamp();

                await channel.send({ embeds: [closeEmbed] });
                
                // Aguardar 10 segundos antes de deletar
                setTimeout(async () => {
                    try {
                        await channel.delete();
                    } catch (error) {
                        console.error('Erro ao deletar canal automaticamente:', error);
                    }
                }, 10000);
            }
        } catch (error) {
            console.error('Erro no timer automático:', error);
        }
    }, 24 * 60 * 60 * 1000); // 24 horas em millisegundos
}

async function handleCancelTimer(interaction) {
    const channel = interaction.channel;
    const user = interaction.user;
    
    // Verificar se é um canal de ticket
    const { isTicketChannel, getTicketInfo } = require('../utils/permissions');
    const isTicket = isTicketChannel(channel);
    
    if (!isTicket) {
        return interaction.reply({
            content: '❌ Este comando só funciona em canais de ticket.',
            flags: 64
        });
    }

    // Extrair informações do ticket para verificar se é o dono
    const ticketInfo = getTicketInfo(channel);
    const isTicketOwner = ticketInfo && ticketInfo.username === user.username;
    const isStaff = isStaffMember(interaction.member);
    
    // Permitir cancelar se for staff OU se for o dono do ticket
    if (!isStaff && !isTicketOwner) {
        return interaction.reply({
            content: '❌ Apenas o dono do ticket ou membros da staff podem cancelar o timer.',
            flags: 64
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('❌ Timer Cancelado')
        .setDescription(`O timer de 24 horas foi cancelado por ${interaction.user}.`)
        .setColor(config.branding.successColor)
        .setTimestamp();

    await interaction.update({
        embeds: [embed],
        components: []
    });
}

async function handleModalSubmit(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const { customId } = interaction;

    // Verificar se é um modal de criação de ticket
    if (customId.startsWith('ticket_creation_modal_')) {
        await handleTicketCreationModal(interaction);
        return;
    }

    switch (customId) {
        case 'close_ticket_modal':
            await handleCloseTicketModal(interaction);
            break;
        case 'add_member_modal':
            await handleAddMemberModal(interaction);
            break;
        case 'rename_ticket_modal':
            await handleRenameTicketModal(interaction);
            break;
    }
}

async function handleTicketCreationModal(interaction) {
    // Defer reply para evitar timeout
    await interaction.deferReply({ flags: 64 });
    
    const subject = interaction.fields.getTextInputValue('ticket_subject_input');
    const category = interaction.customId.replace('ticket_creation_modal_', '');
    const categoryConfig = config.ticketCategories[category];
    
    if (!categoryConfig) {
        return interaction.editReply({
            content: '❌ Categoria inválida selecionada.'
        });
    }

    const guild = interaction.guild;
    const user = interaction.user;

    // Verificar se o usuário já tem 2 tickets abertos em QUALQUER categoria
    const existingTickets = guild.channels.cache.filter(channel => {
        if (channel.type !== ChannelType.GuildText) return false;
        
        // Verificar por padrão de nome com emoji
        for (const [cat, catConfig] of Object.entries(config.ticketCategories)) {
            if (channel.name === `${catConfig.emoji}${cat}-${user.username}` || 
                channel.name === `${cat}-${user.username}`) {
                return true;
            }
        }
        return false;
    });

    if (existingTickets.size >= 2) {
        const ticketList = existingTickets.map(channel => channel.toString()).join(', ');
        return interaction.editReply({
            content: `❌ Você já possui 2 tickets abertos: ${ticketList}\n\nFeche um dos tickets antes de abrir um novo.`
        });
    }

    try {
        // Obter categoria específica para este tipo de ticket
        let ticketCategory = null;
        if (categoryConfig.categoryId) {
            ticketCategory = guild.channels.cache.get(categoryConfig.categoryId);
        }

        // Criar canal do ticket com emoji
        const ticketChannel = await guild.channels.create({
            name: `${categoryConfig.emoji}${category}-${user.username}`,
            type: ChannelType.GuildText,
            parent: ticketCategory
        });

        // Garantir que o usuário tenha acesso ao canal
        await ticketChannel.permissionOverwrites.edit(user, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });

        // Criar embed de boas-vindas do ticket
        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket Aberto - ${categoryConfig.emoji} ${categoryConfig.name}`)
            .setDescription(
                `Olá ${user}, obrigado por entrar em contato!

` +
                'Sua solicitação foi registrada e nossa equipe irá te atender o mais breve possível. Acompanhe o status do seu ticket por aqui.'
            )
            .addFields(
                { name: 'Categoria', value: `${categoryConfig.emoji} ${categoryConfig.name}`, inline: true },
                { name: 'Status', value: '⏳ Aguardando atendimento', inline: true },
                { name: 'Tempo de Resposta', value: 'Até **72h úteis**', inline: true },
                { name: 'Assunto', value: subject, inline: false },
                { name: 'Descrição', value: categoryConfig.description, inline: false }
            )
            .setColor(config.branding.primaryColor)
            .setThumbnail(config.branding.logoUrl)
            .setFooter({ text: 'StreetCarClub • Atendimento de Qualidade | ' + config.branding.footer })
            .setTimestamp();

        // Criar painel de controle do ticket
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        const controlPanel = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close_request')
                    .setLabel('Fechar Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel('Assumir Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✋'),
                new ButtonBuilder()
                    .setCustomId('ticket_add_member')
                    .setLabel('Adicionar Membro')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➕')
            );

        const controlPanel2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_notify_member')
                    .setLabel('Avisar Membro')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔔'),
                new ButtonBuilder()
                    .setCustomId('ticket_rename')
                    .setLabel('Renomear Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✏️'),
                new ButtonBuilder()
                    .setCustomId('ticket_timer')
                    .setLabel('Timer 24h')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏰')
            );

        await ticketChannel.send({
            content: `🔔 ${user} abriu um ticket! Equipe notificada: ${getRoleMentions(guild, categoryConfig.allowedRoles)}`,
            embeds: [welcomeEmbed],
            components: [controlPanel, controlPanel2]
        });

        // Log do ticket criado
        await logTicketActivity(guild, 'create', {
            user: user,
            category: categoryConfig.name,
            channel: ticketChannel,
            subject: subject
        });

        await interaction.editReply({
            content: `✅ Seu ticket foi criado com sucesso! ${ticketChannel}`
        });

    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        await interaction.editReply({
            content: '❌ Erro ao criar o ticket. Tente novamente mais tarde.'
        });
    }
}

async function handleCloseTicketModal(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    // Defer reply imediatamente para evitar timeout
    await interaction.deferReply();
    
    const reason = interaction.fields.getTextInputValue('close_reason_input');
    const channel = interaction.channel;

    // Criar transcript HTML antes de fechar
    const transcriptData = await createTranscriptHTML(channel);

    // Extrair informações do ticket usando a função utilitária
    const { category: currentCategory, emoji: currentEmoji } = detectTicketCategory(channel.name);
    let channelName = channel.name;
    
    // Remover emoji se presente
    if (channelName.startsWith(currentEmoji)) {
        channelName = channelName.substring(currentEmoji.length);
    }
    
    const channelParts = channelName.split('-');
    const ticketOwner = channelParts.length >= 2 ? channelParts[1] : 'Desconhecido';

    // Log do fechamento com arquivo
    await logTicketActivityWithFile(interaction.guild, 'close', {
        closedBy: interaction.user,
        ticketOwner: ticketOwner,
        channelName: channel.name,
        reason: reason,
        transcriptData: transcriptData
    });

    const embed = new EmbedBuilder()
        .setTitle('🔒 Ticket Será Fechado')
        .setDescription(`Este ticket será fechado em **10 segundos** por ${interaction.user}`)
        .addFields(
            { name: 'Motivo', value: reason },
            { name: 'Categoria', value: `${currentEmoji} ${config.ticketCategories[currentCategory].name}`, inline: true }
        )
        .setColor(config.branding.errorColor)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Fechar ticket após 10 segundos
    setTimeout(async () => {
        try {
            await channel.delete();
        } catch (error) {
            console.error('Erro ao deletar canal:', error);
        }
    }, 10000);
}

async function handleAddMemberModal(interaction) {
    const userInput = interaction.fields.getTextInputValue('user_id_input');
    const channel = interaction.channel;
    
    // Extrair ID do usuário (remover <@! e > se for menção)
    const userId = userInput.replace(/[<@!>]/g, '');
    
    try {
        const member = await interaction.guild.members.fetch(userId);
        
        if (!member) {
            return interaction.reply({
                content: '❌ Usuário não encontrado no servidor.',
                flags: 64
            });
        }

        // Adicionar permissões ao canal
        await channel.permissionOverwrites.create(member.user, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });

        const embed = new EmbedBuilder()
            .setTitle('➕ Membro Adicionado')
            .setDescription(`${member.user} foi adicionado ao ticket por ${interaction.user}.`)
            .setColor(config.branding.successColor)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Erro ao adicionar membro:', error);
        await interaction.reply({
            content: '❌ Erro ao adicionar o membro. Verifique se o ID está correto.',
            flags: 64
        });
    }
}

async function handleRenameTicketModal(interaction) {
    const newName = interaction.fields.getTextInputValue('new_name_input');
    const channel = interaction.channel;
    
    try {
        const oldName = channel.name;
        
        // Detectar a categoria do ticket atual usando a função utilitária
        const { category: currentCategory, emoji: currentEmoji } = detectTicketCategory(oldName);
        
        // Preparar o novo nome mantendo o ícone da categoria
        let finalNewName = newName;
        
        // Se o novo nome não começa com o emoji da categoria, adicionar
        if (!finalNewName.startsWith(currentEmoji)) {
            finalNewName = currentEmoji + finalNewName;
        }
        
        // Renomear o canal
        await channel.setName(finalNewName);

        const embed = new EmbedBuilder()
            .setTitle('✏️ Ticket Renomeado')
            .setDescription(`Canal renomeado por ${interaction.user}`)
            .addFields(
                { name: 'Nome Anterior', value: oldName, inline: true },
                { name: 'Novo Nome', value: finalNewName, inline: true },
                { name: 'Categoria', value: `${currentEmoji} ${config.ticketCategories[currentCategory].name}`, inline: true }
            )
            .setColor(config.branding.infoColor)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Erro ao renomear canal:', error);
        await interaction.reply({
            content: '❌ Erro ao renomear o ticket. Verifique se o nome é válido.',
            flags: 64
        });
    }
}

async function createTranscriptHTML(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const config = require('../config.js');
        // Detectar categoria e dono
        const { category: currentCategory, emoji: currentEmoji } = require('../utils/ticketUtils').detectTicketCategory(channel.name);
        let channelName = channel.name;
        if (channelName.startsWith(currentEmoji)) {
            channelName = channelName.substring(currentEmoji.length);
        }
        const channelParts = channelName.split('-');
        const ticketOwner = channelParts.length >= 2 ? channelParts[1] : 'Desconhecido';
        const categoryName = config.ticketCategories[currentCategory]?.name || 'Desconhecida';
        const logoUrl = config.branding.logoUrl;
        let html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcript - ${channel.name}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #23272a;
            color: #f6f6f7;
            margin: 0;
            padding: 0;
        }
        .header {
            background: linear-gradient(90deg, #00a7e3 0%, #23272a 100%);
            padding: 32px 20px 20px 20px;
            border-radius: 0 0 16px 16px;
            text-align: center;
            box-shadow: 0 2px 8px #0003;
        }
        .header img {
            width: 80px;
            border-radius: 16px;
            margin-bottom: 10px;
        }
        .header h1 {
            color: #fff;
            margin: 0 0 8px 0;
            font-size: 2.2em;
        }
        .header .info {
            color: #b9bbbe;
            font-size: 1em;
            margin-bottom: 8px;
        }
        .ticket-meta {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 24px;
            margin: 18px 0 0 0;
        }
        .ticket-meta .meta {
            background: #2c2f33;
            border-radius: 8px;
            padding: 10px 18px;
            color: #fff;
            font-size: 1em;
            min-width: 180px;
            box-shadow: 0 1px 4px #0002;
        }
        .messages {
            margin: 32px auto 0 auto;
            max-width: 900px;
        }
        .message {
            background-color: #36393f;
            margin: 12px 0;
            padding: 18px;
            border-radius: 10px;
            border-left: 5px solid #00a7e3;
            box-shadow: 0 1px 4px #0002;
        }
        .bot-message {
            border-left-color: #faa61a;
        }
        .message-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }
        .username {
            font-weight: bold;
            color: #00a7e3;
            margin-right: 12px;
        }
        .timestamp {
            color: #b9bbbe;
            font-size: 13px;
        }
        .message-content {
            line-height: 1.6;
            word-wrap: break-word;
            margin-top: 4px;
        }
        .attachment {
            background-color: #23272a;
            padding: 10px;
            margin-top: 10px;
            border-radius: 6px;
            border-left: 3px solid #faa61a;
        }
        .attachment a {
            color: #00b0f4;
            text-decoration: none;
        }
        .embed {
            background-color: #23272a;
            border-left: 4px solid #5865f2;
            padding: 10px;
            margin-top: 10px;
            border-radius: 6px;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            color: #b9bbbe;
            font-size: 1em;
            padding-bottom: 24px;
        }
        .footer strong {
            color: #00a7e3;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="${logoUrl}" alt="Logo" />
        <h1>Transcript do Ticket</h1>
        <div class="info">Registro completo da conversa deste ticket.</div>
        <div class="ticket-meta">
            <div class="meta"><strong>Canal:</strong> ${channel.name}</div>
            <div class="meta"><strong>Dono:</strong> ${ticketOwner}</div>
            <div class="meta"><strong>Categoria:</strong> ${currentEmoji} ${categoryName}</div>
            <div class="meta"><strong>Data de Geração:</strong> ${new Date().toLocaleString('pt-BR')}</div>
            <div class="meta"><strong>Total de Mensagens:</strong> ${sortedMessages.size}</div>
        </div>
    </div>
    <div class="messages">`;

        for (const message of sortedMessages.values()) {
            const isBot = message.author.bot;
            const messageClass = isBot ? 'message bot-message' : 'message';
            html += `
        <div class="${messageClass}">
            <div class="message-header">
                <span class="username">${message.author.tag}</span>
                <span class="timestamp">${message.createdAt.toLocaleString('pt-BR')}</span>
            </div>
            <div class="message-content">${message.content || '<i>Mensagem sem conteúdo</i>'}</div>`;
            if (message.attachments.size > 0) {
                message.attachments.forEach(attachment => {
                    html += `
            <div class="attachment">
                📎 <a href="${attachment.url}" target="_blank">${attachment.name}</a>
                <br><small>Tamanho: ${(attachment.size / 1024).toFixed(2)} KB</small>
            </div>`;
                });
            }
            if (message.embeds.length > 0) {
                message.embeds.forEach(embed => {
                    html += `
            <div class="embed">
                <strong>Embed:</strong> ${embed.title || 'Sem título'}
                <br>${embed.description || ''}
            </div>`;
                });
            }
            html += `
        </div>`;
        }
        html += `
    </div>
    <div class="footer">
        <strong>StreetCarClub</strong> • Sistema de Tickets<br/>
        <span>Transcript gerado automaticamente. Para dúvidas, entre em contato com a equipe.</span>
        <br/><br/>
        <span style="font-size:0.9em;">${config.branding.footer}</span>
    </div>
</body>
</html>`;
        // Salvar o HTML em arquivo
        const fs = require('fs');
        const path = require('path');
        const transcriptsDir = path.join(__dirname, '..', 'transcripts');
        if (!fs.existsSync(transcriptsDir)) {
            fs.mkdirSync(transcriptsDir, { recursive: true });
        }
        const filename = `transcript-${channel.name}-${Date.now()}.html`;
        const filepath = path.join(transcriptsDir, filename);
        fs.writeFileSync(filepath, html, 'utf8');
        return {
            filename: filename,
            filepath: filepath,
            htmlContent: html
        };
    } catch (error) {
        console.error('Erro ao criar transcript HTML:', error);
        return 'Erro ao gerar transcript HTML';
    }
}

async function logTicketActivity(guild, action, data) {
    if (!config.guild.logChannelId) return;

    const logChannel = guild.channels.cache.get(config.guild.logChannelId);
    if (!logChannel) return;

    let embed;
    
    if (action === 'create') {
        embed = new EmbedBuilder()
            .setTitle('📋 Log de Ticket - Criado')
            .addFields(
                { name: 'Usuário', value: `${data.user} (${data.user.tag})`, inline: true },
                { name: 'Categoria', value: data.category, inline: true },
                { name: 'Canal', value: `${data.channel}`, inline: true }
            )
            .setColor(config.branding.successColor)
            .setTimestamp();
    }

    if (embed) {
        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao enviar log:', error);
        }
    }
}

async function logTicketActivityWithFile(guild, action, data) {
    if (!config.guild.logChannelId) return;
    const logChannel = guild.channels.cache.get(config.guild.logChannelId);
    if (!logChannel) return;
    if (action === 'close') {
        const embed = new EmbedBuilder()
            .setTitle('📋 Log de Ticket - Fechado')
            .setDescription('O ticket foi encerrado e o histórico completo está disponível no arquivo em anexo.')
            .addFields(
                { name: 'Fechado por', value: `${data.closedBy} (${data.closedBy.tag})`, inline: true },
                { name: 'Dono do Ticket', value: data.ticketOwner || 'Desconhecido', inline: true },
                { name: 'Canal', value: data.channelName, inline: true },
                { name: 'Motivo', value: data.reason || 'Sem motivo especificado', inline: false }
            )
            .setColor(config.branding.errorColor)
            .setFooter({ text: 'StreetCarClub • Sistema de Tickets | ' + config.branding.footer })
            .setTimestamp();
        try {
            if (data.transcriptData && data.transcriptData.filepath) {
                const fs = require('fs');
                const { AttachmentBuilder } = require('discord.js');
                const attachment = new AttachmentBuilder(data.transcriptData.filepath, {
                    name: data.transcriptData.filename
                });
                await logChannel.send({
                    content: '📎 Transcript do ticket encerrado disponível em anexo. Para dúvidas, consulte a equipe.',
                    embeds: [embed],
                    files: [attachment]
                });
            } else {
                await logChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Erro ao enviar log com arquivo:', error);
            try {
                await logChannel.send({ embeds: [embed] });
            } catch (fallbackError) {
                console.error('Erro ao enviar log de fallback:', fallbackError);
            }
        }
    }
}
