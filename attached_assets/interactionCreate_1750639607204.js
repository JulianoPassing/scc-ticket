const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');
const { getRolePermissions } = require('../utils/permissions.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        // Tratar comandos slash
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('Erro ao executar comando:', error);
                const reply = {
                    content: '❌ Houve um erro ao executar este comando!',
                    ephemeral: true
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        }

        // Tratar seleção de categoria de ticket
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
            await handleTicketCreation(interaction);
        }

        // Tratar botões do painel de controle
        if (interaction.isButton()) {
            await handleTicketButtons(interaction);
        }

        // Tratar modais
        if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    }
};

async function handleTicketCreation(interaction) {
    const category = interaction.values[0];
    const categoryConfig = config.ticketCategories[category];
    
    if (!categoryConfig) {
        return interaction.reply({
            content: '❌ Categoria inválida selecionada.',
            ephemeral: true
        });
    }

    const guild = interaction.guild;
    const user = interaction.user;

    // Verificar se o usuário já tem um ticket aberto
    const existingTicket = guild.channels.cache.find(
        channel => (channel.name === `${categoryConfig.emoji}${category}-${user.username}` || 
                   channel.name === `${category}-${user.username}`) && 
                   channel.type === ChannelType.GuildText
    );

    if (existingTicket) {
        return interaction.reply({
            content: `❌ Você já possui um ticket aberto nesta categoria: ${existingTicket}`,
            ephemeral: true
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
            parent: ticketCategory,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                ...getRolePermissions(guild, categoryConfig.allowedRoles)
            ]
        });

        // Criar embed de boas-vindas do ticket
        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket - ${categoryConfig.name}`)
            .setDescription(
                `Olá ${user}! Seu ticket foi criado com sucesso.\n\n` +
                `**Categoria:** ${categoryConfig.emoji} ${categoryConfig.name}\n` +
                `**Descrição:** ${categoryConfig.description}\n\n` +
                `Nossa equipe será notificada e responderá em breve.\n\n` +
                `⏰ **Tempo de resposta:** 72h úteis\n` +
                `🔧 **Prazo para solução:** Pode variar de acordo com o caso`
            )
            .setColor(config.branding.primaryColor)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: config.branding.footer })
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
            content: `${user} - Equipe notificada! ${getRoleMentions(guild, categoryConfig.allowedRoles)}`,
            embeds: [welcomeEmbed],
            components: [controlPanel, controlPanel2]
        });

        // Log do ticket criado
        await logTicketActivity(guild, 'create', {
            user: user,
            category: categoryConfig.name,
            channel: ticketChannel
        });

        await interaction.reply({
            content: `✅ Seu ticket foi criado com sucesso! ${ticketChannel}`,
            ephemeral: true
        });

    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        await interaction.reply({
            content: '❌ Erro ao criar o ticket. Tente novamente mais tarde.',
            ephemeral: true
        });
    }
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

    // Verificar se é um botão de cancelar timer
    if (customId.startsWith('cancel_timer_')) {
        return await handleCancelTimer(interaction);
    }

    // Verificar se é um canal de ticket
    const { isTicketChannel } = require('../utils/permissions');
    const isTicket = isTicketChannel(channel);

    if (!isTicket) {
        return interaction.reply({
            content: '❌ Este painel só funciona em canais de ticket.',
            flags: 64 // ephemeral
        });
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

        await interaction.showModal(modal);
    } else {
        // Se não for staff, apenas solicitar encerramento
        const embed = new EmbedBuilder()
            .setTitle('🔒 Solicitação de Encerramento')
            .setDescription(`${interaction.user} solicitou o encerramento deste ticket.`)
            .setColor(config.branding.errorColor)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}

async function handleClaimTicket(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('✋ Ticket Assumido')
        .setDescription(`${interaction.user} assumiu este ticket e será responsável pelo atendimento.`)
        .setColor(config.branding.warningColor)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleAddMember(interaction) {
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

    await interaction.showModal(modal);
}

async function handleNotifyMember(interaction) {
    const channel = interaction.channel;
    let channelName = channel.name;
    
    // Remover emoji se presente
    Object.keys(config.ticketCategories).forEach(category => {
        const categoryConfig = config.ticketCategories[category];
        if (channelName.startsWith(categoryConfig.emoji)) {
            channelName = channelName.substring(categoryConfig.emoji.length);
        }
    });
    
    const ticketOwner = channelName.split('-')[1];
    const member = interaction.guild.members.cache.find(m => m.user.username === ticketOwner);
    
    if (!member) {
        return interaction.reply({
            content: '❌ Não foi possível encontrar o usuário deste ticket.',
            flags: 64
        });
    }

    try {
        // Enviar mensagem privada para o usuário
        await member.send({
            embeds: [{
                title: '🔔 Notificação de Ticket',
                description: `Você tem uma nova mensagem no seu ticket **${channel.name}** no servidor **${interaction.guild.name}**.`,
                color: 0x00ff00,
                fields: [
                    {
                        name: '📍 Canal',
                        value: `<#${channel.id}>`,
                        inline: true
                    },
                    {
                        name: '👤 Notificado por',
                        value: `${interaction.user}`,
                        inline: true
                    }
                ],
                footer: {
                    text: '™ Street CarClub © All rights reserved',
                    icon_url: 'https://i.imgur.com/ShgYL6s.png'
                },
                timestamp: new Date()
            }]
        });

        await interaction.reply({
            content: `✅ ${member.user.username} foi notificado no privado sobre atividade no ticket!`,
            flags: 64
        });
    } catch (error) {
        console.error('Erro ao notificar membro:', error);
        await interaction.reply({
            content: '❌ Não foi possível enviar mensagem privada para o usuário. Ele pode ter DMs bloqueadas.',
            flags: 64
        });
    }
}

async function handleRenameTicket(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

    const modal = new ModalBuilder()
        .setCustomId('rename_ticket_modal')
        .setTitle('Renomear Ticket');

    const nameInput = new TextInputBuilder()
        .setCustomId('new_name_input')
        .setLabel('Novo nome do ticket')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('suporte-joao-resolvido')
        .setRequired(true);

    const row = new ActionRowBuilder().addComponents(nameInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

// Map para armazenar timers ativos
const activeTimers = new Map();

async function handleTicketTimer(interaction) {
    const channel = interaction.channel;

    // Verificar se já existe um timer ativo para este canal
    if (activeTimers.has(channel.id)) {
        return interaction.reply({
            content: '⏰ Já existe um timer ativo neste ticket.',
            flags: 64
        });
    }

    // Criar embed do timer
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    const timerEmbed = new EmbedBuilder()
        .setTitle('⏰ Timer de Fechamento Ativado')
        .setDescription(
            'Este ticket será **fechado automaticamente em 24 horas** se não houver resposta.\n\n' +
            'Para cancelar o timer, clique no botão abaixo.'
        )
        .addFields(
            { name: '⏱️ Tempo Restante', value: '24 horas', inline: true },
            { name: '🔒 Fechamento', value: 'Automático', inline: true }
        )
        .setColor(config.branding.warningColor)
        .setTimestamp();

    // Criar botão para cancelar timer
    const cancelButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`cancel_timer_${channel.id}`)
                .setLabel('Cancelar Timer')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    // Enviar mensagem do timer
    const timerMessage = await interaction.reply({
        embeds: [timerEmbed],
        components: [cancelButton],
        fetchReply: true
    });

    // Configurar timer de 24 horas (24 * 60 * 60 * 1000 ms)
    const timerId = setTimeout(async () => {
        try {
            // Remover timer do Map
            activeTimers.delete(channel.id);

            // Criar transcript antes de fechar
            const transcriptData = await createTranscriptHTML(channel);

            // Extrair informações do ticket
            let channelName = channel.name;
            
            // Remover emoji se presente
            Object.keys(config.ticketCategories).forEach(category => {
                const categoryConfig = config.ticketCategories[category];
                if (channelName.startsWith(categoryConfig.emoji)) {
                    channelName = channelName.substring(categoryConfig.emoji.length);
                }
            });
            
            const channelParts = channelName.split('-');
            const ticketOwner = channelParts.length >= 2 ? channelParts[1] : 'Desconhecido';

            // Log do fechamento automático
            await logTicketActivityWithFile(interaction.guild, 'close', {
                closedBy: { username: 'Sistema', tag: 'Sistema#0000' },
                ticketOwner: ticketOwner,
                channelName: channel.name,
                reason: 'Fechamento automático - Timer de 24h expirado',
                transcriptData: transcriptData
            });

            // Embed de fechamento automático
            const closeEmbed = new EmbedBuilder()
                .setTitle('🔒 Ticket Fechado Automaticamente')
                .setDescription('Este ticket foi fechado automaticamente após 24 horas sem resposta.')
                .addFields({ name: 'Motivo', value: 'Timer de 24h expirado' })
                .setColor(config.branding.errorColor)
                .setTimestamp();

            await channel.send({ embeds: [closeEmbed] });

            // Deletar canal após 10 segundos
            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    console.error('Erro ao deletar canal:', error);
                }
            }, 10000);

        } catch (error) {
            console.error('Erro no fechamento automático:', error);
            activeTimers.delete(channel.id);
        }
    }, 24 * 60 * 60 * 1000); // 24 horas

    // Armazenar timer no Map
    activeTimers.set(channel.id, {
        timerId: timerId,
        messageId: timerMessage.id,
        startTime: Date.now()
    });
}

async function handleCancelTimer(interaction) {
    const channelId = interaction.customId.split('_')[2];
    
    if (!activeTimers.has(channelId)) {
        return interaction.reply({
            content: '❌ Nenhum timer ativo encontrado.',
            flags: 64
        });
    }

    // Cancelar timer
    const timerData = activeTimers.get(channelId);
    clearTimeout(timerData.timerId);
    activeTimers.delete(channelId);

    // Atualizar embed
    const { EmbedBuilder } = require('discord.js');
    const canceledEmbed = new EmbedBuilder()
        .setTitle('⏰ Timer Cancelado')
        .setDescription('O timer de fechamento automático foi cancelado com sucesso.')
        .setColor(config.branding.successColor)
        .setTimestamp();

    await interaction.update({
        embeds: [canceledEmbed],
        components: []
    });
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
                { name: 'Canal', value: data.channel.toString(), inline: true }
            )
            .setColor(config.branding.infoColor)
            .setTimestamp();
    } else if (action === 'close') {
        embed = new EmbedBuilder()
            .setTitle('📋 Log de Ticket - Fechado')
            .addFields(
                { name: 'Fechado por', value: `${data.closedBy} (${data.closedBy.tag})`, inline: true },
                { name: 'Dono do Ticket', value: data.ticketOwner || 'Desconhecido', inline: true },
                { name: 'Canal', value: data.channelName, inline: true },
                { name: 'Motivo', value: data.reason || 'Sem motivo especificado', inline: false }
            )
            .setColor(config.branding.errorColor)
            .setTimestamp();

        // O transcript será anexado como arquivo, não no embed
    }

    try {
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Erro ao enviar log:', error);
    }
}

async function logTicketActivityWithFile(guild, action, data) {
    if (!config.guild.logChannelId) return;

    const logChannel = guild.channels.cache.get(config.guild.logChannelId);
    if (!logChannel) return;

    if (action === 'close') {
        const embed = new EmbedBuilder()
            .setTitle('📋 Log de Ticket - Fechado')
            .addFields(
                { name: 'Fechado por', value: `${data.closedBy} (${data.closedBy.tag})`, inline: true },
                { name: 'Dono do Ticket', value: data.ticketOwner || 'Desconhecido', inline: true },
                { name: 'Canal', value: data.channelName, inline: true },
                { name: 'Motivo', value: data.reason || 'Sem motivo especificado', inline: false }
            )
            .setColor(config.branding.errorColor)
            .setTimestamp();

        try {
            const { AttachmentBuilder } = require('discord.js');
            
            // Criar anexo do transcript
            const attachment = new AttachmentBuilder(Buffer.from(data.transcriptData.htmlContent, 'utf8'), {
                name: data.transcriptData.filename
            });

            await logChannel.send({ 
                embeds: [embed],
                files: [attachment]
            });
        } catch (error) {
            console.error('Erro ao enviar log com arquivo:', error);
            // Fallback sem arquivo
            await logChannel.send({ embeds: [embed] });
        }
    }
}

async function handleModalSubmit(interaction) {
    const { customId } = interaction;

    switch (customId) {
        case 'add_member_modal':
            await handleAddMemberModal(interaction);
            break;
        case 'rename_ticket_modal':
            await handleRenameModal(interaction);
            break;
        case 'close_ticket_modal':
            await handleCloseTicketModal(interaction);
            break;
    }
}

async function handleAddMemberModal(interaction) {
    const userInput = interaction.fields.getTextInputValue('user_id_input');
    const channel = interaction.channel;
    const guild = interaction.guild;

    try {
        let userId = userInput;
        
        // Extrair ID de menção se necessário
        if (userInput.startsWith('<@') && userInput.endsWith('>')) {
            userId = userInput.slice(2, -1);
            if (userId.startsWith('!')) {
                userId = userId.slice(1);
            }
        }

        const member = await guild.members.fetch(userId);
        
        if (member) {
            await channel.permissionOverwrites.edit(member, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            const embed = new EmbedBuilder()
                .setTitle('➕ Membro Adicionado')
                .setDescription(`${member} foi adicionado ao ticket por ${interaction.user}`)
                .setColor(config.branding.successColor)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    } catch (error) {
        await interaction.reply({
            content: '❌ Usuário não encontrado. Verifique o ID ou menção.',
            flags: 64
        });
    }
}

async function handleRenameModal(interaction) {
    const newName = interaction.fields.getTextInputValue('new_name_input');
    const channel = interaction.channel;

    try {
        await channel.setName(newName);

        const embed = new EmbedBuilder()
            .setTitle('✏️ Ticket Renomeado')
            .setDescription(`Canal renomeado para **${newName}** por ${interaction.user}`)
            .setColor(config.branding.infoColor)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        await interaction.reply({
            content: '❌ Erro ao renomear o canal. Verifique se o nome é válido.',
            flags: 64
        });
    }
}

async function handleCloseTicketModal(interaction) {
    const reason = interaction.fields.getTextInputValue('close_reason_input');
    const channel = interaction.channel;

    try {
        // Criar transcript HTML antes de fechar
        const transcriptData = await createTranscriptHTML(channel);

        // Extrair informações do ticket
        let channelName = channel.name;
        
        // Remover emoji se presente
        Object.keys(config.ticketCategories).forEach(category => {
            const categoryConfig = config.ticketCategories[category];
            if (channelName.startsWith(categoryConfig.emoji)) {
                channelName = channelName.substring(categoryConfig.emoji.length);
            }
        });
        
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
            .addFields({ name: 'Motivo', value: reason })
            .setColor(config.branding.errorColor)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Fechar ticket após 10 segundos
        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (error) {
                console.error('Erro ao deletar canal:', error);
            }
        }, 10000);

    } catch (error) {
        console.error('Erro ao fechar ticket:', error);
        await interaction.reply({
            content: 'Erro ao fechar o ticket. Tente novamente.',
            flags: 64
        });
    }
}

async function createTranscriptHTML(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
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
            background-color: #36393f;
            color: #dcddde;
            margin: 0;
            padding: 20px;
        }
        .header {
            background-color: #2f3136;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }
        .header h1 {
            color: #7289da;
            margin: 0 0 10px 0;
        }
        .message {
            background-color: #40444b;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #7289da;
        }
        .message-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }
        .username {
            font-weight: bold;
            color: #7289da;
            margin-right: 10px;
        }
        .timestamp {
            color: #72767d;
            font-size: 12px;
        }
        .message-content {
            line-height: 1.4;
            word-wrap: break-word;
        }
        .attachment {
            background-color: #2f3136;
            padding: 10px;
            margin-top: 10px;
            border-radius: 4px;
            border-left: 3px solid #faa61a;
        }
        .attachment a {
            color: #00b0f4;
            text-decoration: none;
        }
        .bot-message {
            border-left-color: #5865f2;
        }
        .embed {
            background-color: #2f3136;
            border-left: 4px solid #5865f2;
            padding: 10px;
            margin-top: 10px;
            border-radius: 4px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #72767d;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 Transcript do Ticket</h1>
        <p><strong>Canal:</strong> ${channel.name}</p>
        <p><strong>Data de Geração:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        <p><strong>Total de Mensagens:</strong> ${sortedMessages.size}</p>
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
        <p>™ Street CarClub © All rights reserved</p>
        <p>Transcript gerado automaticamente pelo sistema de tickets</p>
    </div>
</body>
</html>`;

        // Salvar o HTML em arquivo
        const fs = require('fs');
        const path = require('path');
        const transcriptsDir = path.join(__dirname, '..', 'transcripts');
        
        // Criar diretório se não existir
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

async function createTranscript(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        let transcript = `Transcript do Ticket: ${channel.name}\nData: ${new Date().toLocaleString('pt-BR')}\n\n`;
        
        for (const message of sortedMessages.values()) {
            if (message.author.bot && message.embeds.length > 0) {
                continue;
            }
            
            transcript += `[${message.createdAt.toLocaleString('pt-BR')}] ${message.author.tag}: ${message.content}\n`;
            
            if (message.attachments.size > 0) {
                message.attachments.forEach(attachment => {
                    transcript += `  📎 Anexo: ${attachment.url}\n`;
                });
            }
        }
        
        if (transcript.length > 1000) {
            transcript = transcript.substring(0, 997) + '...';
        }
        
        return transcript;
    } catch (error) {
        console.error('Erro ao criar transcript:', error);
        return 'Erro ao gerar transcript';
    }
}
