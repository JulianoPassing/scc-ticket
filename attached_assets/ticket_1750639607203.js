const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');

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
                ephemeral: true
            });
        }

        const targetChannel = interaction.options.getChannel('canal') || interaction.channel;

        // Criar embed do painel
        const embed = new EmbedBuilder()
            .setTitle('🎫 Sistema de Tickets - Street CarClub')
            .setDescription(
                '**Bem-vindo ao sistema de tickets!**\n\n' +
                'Para abrir um ticket, selecione a categoria apropriada no menu abaixo.\n' +
                'Nossa equipe responderá o mais breve possível.\n\n' +
                '**Categorias disponíveis:**\n' +
                '📂 **Suporte** - Suporte técnico e ajuda geral\n' +
                '🐛 **Reportar Bugs** - Reportar erros e problemas técnicos\n' +
                '⚠️ **Denúncias** - Reportar infrações e problemas de conduta\n' +
                '💎 **Doações** - Assuntos relacionados a doações\n' +
                '🚀 **Boost** - Suporte para membros boosters\n' +
                '🏠 **Casas** - Questões relacionadas a casas e propriedades'
            )
            .setColor(config.branding.primaryColor)
            .setImage(config.branding.logoUrl)
            .setFooter({ text: config.branding.footer })
            .setTimestamp();

        // Criar menu de seleção
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_category_select')
            .setPlaceholder('Selecione a categoria do seu ticket')
            .addOptions(
                Object.entries(config.ticketCategories).map(([key, category]) => ({
                    label: `${category.emoji} ${category.name}`,
                    description: category.description,
                    value: key
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        try {
            await targetChannel.send({
                embeds: [embed],
                components: [row]
            });

            await interaction.reply({
                content: `✅ Painel de tickets criado com sucesso em ${targetChannel}!`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Erro ao criar painel:', error);
            await interaction.reply({
                content: '❌ Erro ao criar o painel de tickets. Verifique as permissões do bot.',
                ephemeral: true
            });
        }
    },

    async closeTicket(interaction) {
        const channel = interaction.channel;
        
        // Verificar se é um canal de ticket
        const { isTicketChannel: checkIsTicketChannel } = require('../utils/permissions');
        const isTicketChannel = checkIsTicketChannel(channel);
        
        if (!isTicketChannel) {
            return interaction.reply({
                content: '❌ Este comando só pode ser usado em canais de ticket.',
                ephemeral: true
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
                ephemeral: true
            });
        }

        // Criar transcript HTML antes de fechar
        const transcriptData = await this.createTranscriptHTML(channel);

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
            .addFields({ name: 'Motivo', value: motivo })
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
                    { name: 'Motivo', value: data.reason || 'Sem motivo especificado', inline: false }
                )
                .setColor(config.branding.errorColor)
                .setTimestamp();

            // O transcript será anexado como arquivo
        }

        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao enviar log:', error);
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
};
