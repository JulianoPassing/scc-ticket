module.exports = {
    // Configurações das categorias de tickets
    ticketCategories: {
        'suporte': {
            name: 'Suporte',
            emoji: '📂',
            description: 'Suporte técnico e ajuda geral',
            allowedRoles: ['STAFF_ADM', 'COORDENADOR', 'MODERADOR', 'SEGURANÇA', 'SUPORTE', 'AJUDANTE'],
            categoryId: '1386490182085382294'
        },
        'bugs': {
            name: 'Reportar Bugs',
            emoji: '🐛',
            description: 'Reportar erros e problemas técnicos',
            allowedRoles: ['STAFF_ADM', 'COORDENADOR', 'MODERADOR', 'SEGURANÇA', 'SUPORTE', 'AJUDANTE'],
            categoryId: '1386490279384846418'
        },
        'denuncias': {
            name: 'Denúncias',
            emoji: '⚠️',
            description: 'Reportar infrações e problemas de conduta',
            allowedRoles: ['STAFF_ADM', 'COORDENADOR', 'MODERADOR', 'SEGURANÇA'],
            categoryId: '1386490428404138054'
        },
        'doacoes': {
            name: 'Doações',
            emoji: '💎',
            description: 'Assuntos relacionados a doações',
            allowedRoles: ['STAFF_ADM'],
            categoryId: '1386490511606419578'
        },
        'boost': {
            name: 'Boost',
            emoji: '🚀',
            description: 'Suporte para membros boosters',
            allowedRoles: ['STAFF_ADM', 'COORDENADOR', 'MODERADOR', 'SEGURANÇA', 'SUPORTE', 'AJUDANTE'],
            categoryId: '1386490600353828884'
        },
        'casas': {
            name: 'Casas',
            emoji: '🏠',
            description: 'Questões relacionadas a casas e propriedades',
            allowedRoles: ['STAFF_ADM', 'COORDENADOR', 'MODERADOR', 'SEGURANÇA', 'SUPORTE', 'AJUDANTE'],
            categoryId: '1386490752485294150'
        }
    },

    // Configurações visuais
    branding: {
        logoUrl: 'https://i.imgur.com/ShgYL6s.png',
        footer: '™ Street CarClub © All rights reserved',
        primaryColor: 0x00a7e3,
        successColor: 0x00c4ff,
        errorColor: 0x0089c7,
        warningColor: 0x0095d1,
        infoColor: 0x007bb8
    },

    // Configurações do servidor
    guild: {
        id: process.env.GUILD_ID,
        categoryId: process.env.TICKETS_CATEGORY_ID || null,
        logChannelId: '1386491920313745418'
    },

    // Definir cargos da staff que podem gerenciar tickets
    staffRoles: [
        '1046404063673192546'
    ],

    // URL base para acessar os transcripts
    transcriptBaseUrl: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/transcripts` : 'http://localhost:5000/transcripts'
};
