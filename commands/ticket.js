const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');
const { detectTicketCategory, prepareTicketName } = require('../utils/ticketUtils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Comandos relacionados ao sistema de tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('painel')
                .setDescription('Cria o painel de tickets')
                .addChannelOption(option =>
                    option.setName('canal')
                        .setDescription('Canal onde o painel será enviado')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('fechar')
                .setDescription('Fecha o ticket atual')
                .addStringOption(option =>
                    option.setName('motivo')
                        .setDescription('Motivo do fechamento')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'painel') {
            await this.createPanel(interaction);
        } else if (subcommand === 'fechar') {
            await this.closeTicket(interaction);
        }
    },

    async createPanel(interaction) {
        // Verificar permissões
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ Você não tem permissão para criar painéis de tickets.',
                flags: 64
            });
        }

        const targetChannel = interaction.options.getChannel('canal') || interaction.channel;

        // Montar campos das categorias
        const categoryFields = Object.entries(config.ticketCategories).map(([key, category]) => ({
            name: `${category.emoji} ${category.name}`,
            value: category.description,
            inline: true
        }));

        // Criar embed do painel
        const embed = new EmbedBuilder()
            .setTitle('🎫 Central de Atendimento - StreetCarClub')
            .setDescription(
                'Bem-vindo à nossa Central de Atendimento!\n\n' +
                'Abra um ticket para receber suporte personalizado da nossa equipe. Selecione a categoria que melhor se encaixa na sua necessidade no menu abaixo.\n\n' +
                ':information_source: **Importante:** Evite marcar a equipe. Você será atendido o mais breve possível.'
            )
            .addFields(categoryFields)
            .setColor(config.branding.primaryColor)
            .setImage(config.branding.logoUrl)
            .setFooter({ text: 'StreetCarClub • Atendimento de Qualidade | ' + config.branding.footer })
            .setTimestamp();

        // Criar botões de categoria
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        const buttons = Object.entries(config.ticketCategories).map(([key, category]) =>
            new ButtonBuilder()
                .setCustomId(`ticket_category_BUTTON_${key}`)
                .setLabel(`${category.emoji} ${category.name}`)
                .setStyle(ButtonStyle.Primary)
        );
        // Dividir botões em linhas de até 3
        const rows = [];
        for (let i = 0; i < buttons.length; i += 3) {
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
        }

        try {
            await targetChannel.send({
                embeds: [embed],
                components: rows
            });

            await interaction.reply({
                content: `✅ Painel de tickets criado com sucesso em ${targetChannel}!`,
                flags: 64
            });
        } catch (error) {
            console.error('Erro ao criar painel:', error);
            await interaction.reply({
                content: '❌ Erro ao criar o painel de tickets. Verifique as permissões do bot.',
                flags: 64
            });
        }
    },

    async closeTicket(interaction) {
        const channel = interaction.channel;
        
        // Verificar se é um canal de ticket
        const { isTicketChannel } = require('../utils/permissions');
        const isTicket = isTicketChannel(channel);
        
        if (!isTicket) {
            return interaction.reply({
                content: '❌ Este comando só pode ser usado em canais de ticket.',
                flags: 64
            });
        }

        const motivo = interaction.options.getString('motivo') || 'Sem motivo especificado';

        // Verificar permissões
        const member = interaction.member;
        const hasPermission = member.permissions.has(PermissionFlagsBits.ManageChannels) ||
                            channel.permissionsFor(member).has(PermissionFlagsBits.ManageChannels);

        if (!hasPermission) {
            return interaction.reply({
                content: '❌ Você não tem permissão para fechar este ticket.',
                flags: 64
            });
        }

        // Criar transcript HTML antes de fechar
        const transcriptData = await this.createTranscriptHTML(channel);

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
        await this.logTicketActivityWithFile(interaction.guild, 'close', {
            closedBy: interaction.user,
            ticketOwner: ticketOwner,
            channelName: channel.name,
            reason: motivo,
            transcriptData: transcriptData
        });

        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Será Fechado')
            .setDescription(`Este ticket será fechado em **10 segundos** por ${interaction.user}`)
            .addFields(
                { name: 'Motivo', value: motivo },
                { name: 'Categoria', value: `${currentEmoji} ${config.ticketCategories[currentCategory].name}`, inline: true }
            )
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
    },

    async createTranscriptHTML(channel) {
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
    },

    async logTicketActivity(guild, action, data) {
        if (!config.guild.logChannelId) return;

        const logChannel = guild.channels.cache.get(config.guild.logChannelId);
        if (!logChannel) return;

        let embed;
        
        if (action === 'close') {
            embed = new EmbedBuilder()
                .setTitle('📋 Log de Ticket - Fechado')
                .addFields(
                    { name: 'Fechado por', value: `${data.closedBy} (${data.closedBy.tag})`, inline: true },
                    { name: 'Dono do Ticket', value: data.ticketOwner || 'Desconhecido', inline: true },
                    { name: 'Canal', value: data.channelName, inline: true },
                    { name: 'Motivo', value: data.reason, inline: false }
                )
                .setColor(config.branding.errorColor)
                .setTimestamp();
        }

        if (embed) {
            try {
                await logChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error('Erro ao enviar log:', error);
            }
        }
    },

    async logTicketActivityWithFile(guild, action, data) {
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
    },

    detectTicketCategory(channelName) {
        let currentCategory = null;
        let currentEmoji = '';
        
        // Verificar se o nome atual começa com algum emoji de categoria
        for (const [categoryKey, categoryConfig] of Object.entries(config.ticketCategories)) {
            if (channelName.startsWith(categoryConfig.emoji)) {
                currentCategory = categoryKey;
                currentEmoji = categoryConfig.emoji;
                break;
            }
        }
        
        // Se não encontrou categoria pelo emoji, tentar pelo padrão de nome
        if (!currentCategory) {
            for (const [categoryKey, categoryConfig] of Object.entries(config.ticketCategories)) {
                if (channelName.startsWith(categoryKey + '-')) {
                    currentCategory = categoryKey;
                    currentEmoji = categoryConfig.emoji;
                    break;
                }
            }
        }
        
        // Se ainda não encontrou, usar a primeira categoria como fallback
        if (!currentCategory) {
            currentCategory = Object.keys(config.ticketCategories)[0];
            currentEmoji = config.ticketCategories[currentCategory].emoji;
        }
        
        return { category: currentCategory, emoji: currentEmoji };
    }
};
