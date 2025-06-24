const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');
const { getRolePermissions, isStaffMember } = require('../utils/permissions.js');

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
    // Defer reply para evitar timeout
    await interaction.deferReply({ ephemeral: true });
    
    const category = interaction.values[0];
    const categoryConfig = config.ticketCategories[category];
    
    if (!categoryConfig) {
        return interaction.editReply({
            content: '❌ Categoria inválida selecionada.'
        });
    }

    const guild = interaction.guild;
    const user = interaction.user;

    // Verificar se o usuário já tem um ticket aberto em QUALQUER categoria
    const existingTicket = guild.channels.cache.find(channel => {
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

    if (existingTicket) {
        return interaction.editReply({
            content: `❌ Você já possui um ticket aberto: ${existingTicket}`
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
                ephemeral: true
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
                    ephemeral: true
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
            ephemeral: true
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
                timestamp: new Date().toISOString()
            }]
        });

        return interaction.reply({
            content: `✅ ${member.user.tag} foi notificado sobre o ticket!`,
            ephemeral: true
        });

    } catch (error) {
        console.error('Erro ao enviar DM:', error);
        return interaction.reply({
            content: '❌ Não foi possível enviar a notificação. O usuário pode ter DMs desabilitadas.',
            ephemeral: true
        });
    }
}

async function handleRenameTicket(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

    const modal = new ModalBuilder()
        .setCustomId('rename_ticket_modal')
        .setTitle('Renomear Ticket');

    const nameInput = new TextInputBuilder()
        .setCustomId('new_name_input')
        .setLabel('Novo nome do ticket')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: suporte-usuario-problema-resolvido')
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

async function handleCloseTicketModal(interaction) {
    if (interaction.replied || interaction.deferred) return;
    
    // Defer reply imediatamente para evitar timeout
    await interaction.deferReply();
    
    const reason = interaction.fields.getTextInputValue('close_reason_input');
    const channel = interaction.channel;

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
                ephemeral: true
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
            ephemeral: true
        });
    }
}

async function handleRenameTicketModal(interaction) {
    const newName = interaction.fields.getTextInputValue('new_name_input');
    const channel = interaction.channel;
    
    try {
        const oldName = channel.name;
        await channel.setName(newName);

        const embed = new EmbedBuilder()
            .setTitle('✏️ Ticket Renomeado')
            .setDescription(`Canal renomeado por ${interaction.user}`)
            .addFields(
                { name: 'Nome Anterior', value: oldName, inline: true },
                { name: 'Novo Nome', value: newName, inline: true }
            )
            .setColor(config.branding.infoColor)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Erro ao renomear canal:', error);
        await interaction.reply({
            content: '❌ Erro ao renomear o ticket. Verifique se o nome é válido.',
            ephemeral: true
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
            .addFields(
                { name: 'Fechado por', value: `${data.closedBy} (${data.closedBy.tag})`, inline: true },
                { name: 'Dono do Ticket', value: data.ticketOwner || 'Desconhecido', inline: true },
                { name: 'Canal', value: data.channelName, inline: true },
                { name: 'Motivo', value: data.reason, inline: false }
            )
            .setColor(config.branding.errorColor)
            .setTimestamp();

        try {
            if (data.transcriptData && data.transcriptData.filepath) {
                const fs = require('fs');
                const { AttachmentBuilder } = require('discord.js');
                
                // Criar attachment do arquivo HTML
                const attachment = new AttachmentBuilder(data.transcriptData.filepath, {
                    name: data.transcriptData.filename
                });

                await logChannel.send({
                    embeds: [embed],
                    files: [attachment]
                });
            } else {
                await logChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Erro ao enviar log com arquivo:', error);
            // Tentar enviar sem o arquivo em caso de erro
            try {
                await logChannel.send({ embeds: [embed] });
            } catch (fallbackError) {
                console.error('Erro ao enviar log de fallback:', fallbackError);
            }
        }
    }
}
