const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3010;

// Configurações do servidor
const GUILD_ID = '1046404063287332936';
const REQUIRED_ROLE_ID = '1046404063673192546';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de sessão
app.use(session({
    secret: process.env.SESSION_SECRET || 'scc-ticket-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Força o cookie a ser enviado em HTTP
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Configuração do Passport
app.use(passport.initialize());
app.use(passport.session());

// Configuração da estratégia Discord
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3010/auth/discord/callback',
    scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Verificar se o usuário está no servidor específico
        const guild = profile.guilds.find(g => g.id === GUILD_ID);
        if (!guild) {
            return done(null, false, { message: 'Você não faz parte do servidor StreetCarClub' });
        }

        // Verificar se o usuário tem o cargo necessário
        const hasRequiredRole = await checkUserRole(profile.id, REQUIRED_ROLE_ID);
        if (!hasRequiredRole) {
            return done(null, false, { message: 'Você não tem permissão para acessar o painel' });
        }

        // Usuário autorizado
        return done(null, {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
            guilds: profile.guilds
        });
    } catch (error) {
        return done(error);
    }
}));

// Serialização do usuário
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Função para verificar se o usuário tem o cargo necessário
async function checkUserRole(userId, roleId) {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return false;

        const member = await guild.members.fetch(userId);
        return member.roles.cache.has(roleId);
    } catch (error) {
        console.error('Erro ao verificar cargo do usuário:', error);
        return false;
    }
}

// Cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Estrutura de dados para tickets (em memória - pode ser migrada para banco de dados)
let tickets = new Map();
let ticketMessages = new Map();

// Função para carregar tickets do Discord
async function loadTicketsFromDiscord() {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        const channels = guild.channels.cache.filter(channel => 
            channel.type === 0 && // GuildText
            (channel.name.includes('🎫') || channel.name.includes('🔧') || channel.name.includes('💰') || channel.name.includes('📋'))
        );

        for (const [channelId, channel] of channels) {
            const ticketData = {
                id: channelId,
                name: channel.name,
                category: detectTicketCategory(channel.name),
                status: 'open',
                createdAt: channel.createdAt,
                lastActivity: new Date(),
                messages: []
            };

            // Carregar mensagens do canal
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                
                ticketData.messages = sortedMessages.map(msg => ({
                    id: msg.id,
                    author: {
                        id: msg.author.id,
                        username: msg.author.username,
                        avatar: msg.author.displayAvatarURL(),
                        isBot: msg.author.bot
                    },
                    content: msg.content,
                    timestamp: msg.createdAt,
                    attachments: msg.attachments.map(att => ({
                        name: att.name,
                        url: att.url,
                        size: att.size
                    }))
                }));
            } catch (error) {
                console.error(`Erro ao carregar mensagens do canal ${channel.name}:`, error);
            }

            tickets.set(channelId, ticketData);
            ticketMessages.set(channelId, ticketData.messages);
        }

        console.log(`Carregados ${tickets.size} tickets do Discord`);
    } catch (error) {
        console.error('Erro ao carregar tickets do Discord:', error);
    }
}

// Função para detectar categoria do ticket
function detectTicketCategory(channelName) {
    if (channelName.includes('🎫')) return 'general';
    if (channelName.includes('🔧')) return 'technical';
    if (channelName.includes('💰')) return 'billing';
    if (channelName.includes('📋')) return 'support';
    return 'general';
}

// Função para salvar mensagem no Discord
async function sendMessageToDiscord(channelId, message, author) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return false;

        const embed = {
            color: 0x7289DA,
            author: {
                name: `${author.username} (via Web)`,
                icon_url: author.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            description: message,
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Resposta via Painel Web'
            }
        };

        await channel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error('Erro ao enviar mensagem para Discord:', error);
        return false;
    }
}

// Middleware de autenticação
function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Não autorizado' });
}

// Rotas de autenticação
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { 
        failureRedirect: '/login?error=unauthorized',
        successRedirect: '/'
    })
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer logout' });
        }
        res.redirect('/login');
    });
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            id: req.user.id,
            username: req.user.username,
            avatar: req.user.avatar
        });
    } else {
        res.status(401).json({ error: 'Não autenticado' });
    }
});

// Rotas da API (protegidas)
app.get('/api/tickets', requireAuth, (req, res) => {
    const ticketsArray = Array.from(tickets.values()).map(ticket => ({
        id: ticket.id,
        name: ticket.name,
        category: ticket.category,
        status: ticket.status,
        createdAt: ticket.createdAt,
        lastActivity: ticket.lastActivity,
        messageCount: ticket.messages.length
    }));
    
    res.json(ticketsArray);
});

app.get('/api/tickets/:id', requireAuth, (req, res) => {
    const ticket = tickets.get(req.params.id);
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket não encontrado' });
    }
    res.json(ticket);
});

app.post('/api/tickets/:id/messages', requireAuth, async (req, res) => {
    const { message, author } = req.body;
    const ticketId = req.params.id;
    
    if (!message || !author) {
        return res.status(400).json({ error: 'Mensagem e autor são obrigatórios' });
    }

    const ticket = tickets.get(ticketId);
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket não encontrado' });
    }

    // Criar nova mensagem
    const newMessage = {
        id: `web_${Date.now()}`,
        author: {
            id: author.id || 'web_user',
            username: author.username,
            avatar: author.avatar,
            isBot: false
        },
        content: message,
        timestamp: new Date(),
        attachments: []
    };

    // Adicionar mensagem ao ticket
    ticket.messages.push(newMessage);
    ticket.lastActivity = new Date();
    ticketMessages.set(ticketId, ticket.messages);

    // Enviar para Discord
    const sentToDiscord = await sendMessageToDiscord(ticketId, message, author);

    res.json({
        success: true,
        message: newMessage,
        sentToDiscord
    });
});

app.get('/api/tickets/:id/messages', requireAuth, (req, res) => {
    const messages = ticketMessages.get(req.params.id);
    if (!messages) {
        return res.status(404).json({ error: 'Mensagens não encontradas' });
    }
    res.json(messages);
});

// Rota para a página principal
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login');
    }
});

// Rota para página de login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// WebSocket para atualizações em tempo real
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
    console.log('Cliente WebSocket conectado');
    
    ws.on('close', () => {
        console.log('Cliente WebSocket desconectado');
    });
});

// Função para notificar clientes WebSocket
function notifyClients(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Evento de mensagem do Discord
client.on('messageCreate', async (message) => {
    // Verificar se é uma mensagem em um canal de ticket
    if (message.channel.type === 0 && tickets.has(message.channel.id)) {
        const newMessage = {
            id: message.id,
            author: {
                id: message.author.id,
                username: message.author.username,
                avatar: message.author.displayAvatarURL(),
                isBot: message.author.bot
            },
            content: message.content,
            timestamp: message.createdAt,
            attachments: message.attachments.map(att => ({
                name: att.name,
                url: att.url,
                size: att.size
            }))
        };

        // Atualizar ticket
        const ticket = tickets.get(message.channel.id);
        if (ticket) {
            ticket.messages.push(newMessage);
            ticket.lastActivity = new Date();
            ticketMessages.set(message.channel.id, ticket.messages);

            // Notificar clientes web
            notifyClients({
                type: 'new_message',
                ticketId: message.channel.id,
                message: newMessage
            });
        }
    }
});

// Inicializar servidor
async function startServer() {
    try {
        // Conectar ao Discord
        await client.login(process.env.DISCORD_TOKEN);
        console.log('Bot conectado ao Discord');

        // Carregar tickets
        await loadTicketsFromDiscord();

        // Criar servidor HTTP
        const server = app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
            console.log(`Acesse: http://localhost:${PORT}`);
        });

        // Integrar WebSocket com servidor HTTP
        server.on('upgrade', (request, socket, head) => {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        });

    } catch (error) {
        console.error('Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer(); 