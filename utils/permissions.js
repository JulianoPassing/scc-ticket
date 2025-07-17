const { PermissionFlagsBits } = require('discord.js');

/**
 * Gera permissões para os cargos especificados
 * @param {Guild} guild - Guild do Discord
 * @param {Array} allowedRoleNames - Array com nomes dos cargos permitidos
 * @returns {Array} Array de objetos de permissão
 */
function getRolePermissions(guild, allowedRoleNames) {
    const permissions = [];
    
    for (const roleName of allowedRoleNames) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role) {
            permissions.push({
                id: role.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.UseExternalEmojis,
                    PermissionFlagsBits.AddReactions
                ]
            });
        }
    }
    
    return permissions;
}

/**
 * Verifica se um membro tem permissão para acessar uma categoria específica
 * @param {GuildMember} member - Membro do Discord
 * @param {Array} allowedRoleNames - Array com nomes dos cargos permitidos
 * @returns {Boolean} True se o membro tem permissão
 */
function hasPermissionForCategory(member, allowedRoleNames) {
    // Administradores sempre têm acesso
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    
    // Verificar se o membro possui algum dos cargos permitidos
    return member.roles.cache.some(role => allowedRoleNames.includes(role.name));
}

/**
 * Verifica se um membro é da staff e pode gerenciar tickets
 * @param {GuildMember} member - Membro do Discord
 * @returns {Boolean} True se o membro é staff
 */
function isStaffMember(member) {
    const config = require('../config.js');
    
    // Administradores sempre são considerados staff
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    
    // Verificar se o membro possui algum cargo de staff (por ID)
    return member.roles.cache.some(role => config.staffRoles.includes(role.id));
}

/**
 * Verifica se um membro pode gerenciar canais (permissão específica)
 * @param {GuildMember} member - Membro do Discord
 * @param {Channel} channel - Canal específico (opcional)
 * @returns {Boolean} True se pode gerenciar canais
 */
function canManageChannels(member, channel = null) {
    // Verificar permissões globais
    if (member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return true;
    }
    
    // Verificar permissões específicas do canal se fornecido
    if (channel && channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels)) {
        return true;
    }
    
    return false;
}

/**
 * Obtém todos os cargos válidos do servidor
 * @param {Guild} guild - Guild do Discord
 * @param {Array} roleNames - Array com nomes dos cargos a procurar
 * @returns {Array} Array de cargos encontrados
 */
function getValidRoles(guild, roleNames) {
    const validRoles = [];
    
    for (const roleName of roleNames) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role) {
            validRoles.push(role);
        }
    }
    
    return validRoles;
}

/**
 * Cria mentions de cargos para notificações
 * @param {Guild} guild - Guild do Discord
 * @param {Array} roleNames - Array com nomes dos cargos
 * @returns {String} String com mentions dos cargos
 */
function createRoleMentions(guild, roleNames) {
    const mentions = [];
    
    for (const roleName of roleNames) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role) {
            mentions.push(`<@&${role.id}>`);
        }
    }
    
    return mentions.join(' ');
}

/**
 * Verifica se um canal é um ticket
 * @param {Channel} channel - Canal do Discord
 * @returns {Boolean} True se for um canal de ticket
 */
function isTicketChannel(channel) {
    const config = require('../config.js');
    
    // Verificar se está nas categorias de ticket configuradas
    if (channel.parent) {
        const categoryIds = Object.values(config.ticketCategories).map(cat => cat.categoryId);
        if (categoryIds.includes(channel.parent.id)) {
            return true;
        }
    }
    
    // Verificar por nome para compatibilidade (incluindo canais renomeados)
    const hasTicketPattern = Object.keys(config.ticketCategories).some(category => {
        const categoryConfig = config.ticketCategories[category];
        return channel.name.startsWith(`${categoryConfig.emoji}${category}-`) || 
               channel.name.startsWith(`${category}-`) ||
               channel.name.includes(`-${category}-`) ||
               channel.name.endsWith(`-${category}`);
    });
    
    if (hasTicketPattern) {
        return true;
    }
    
    // Verificar se o canal contém qualquer emoji de categoria (para canais renomeados)
    const hasCategoryEmoji = Object.values(config.ticketCategories).some(categoryConfig => {
        return channel.name.includes(categoryConfig.emoji);
    });
    
    if (hasCategoryEmoji) {
        return true;
    }
    
    // Verificar se o canal contém o padrão de nome de usuário (formato: categoria-username)
    const hasUsernamePattern = channel.name.includes('-') && 
                              channel.name.split('-').length >= 2 &&
                              channel.name.split('-')[1].length > 0;
    
    return hasUsernamePattern;
}

/**
 * Extrai informações de um canal de ticket
 * @param {Channel} channel - Canal do Discord
 * @returns {Object|null} Objeto com informações do ticket ou null
 */
function getTicketInfo(channel) {
    if (!isTicketChannel(channel)) {
        return null;
    }
    
    const config = require('../config.js');
    let channelName = channel.name;
    
    // Remover emoji se presente
    Object.keys(config.ticketCategories).forEach(category => {
        const categoryConfig = config.ticketCategories[category];
        if (channelName.startsWith(categoryConfig.emoji)) {
            channelName = channelName.substring(categoryConfig.emoji.length);
        }
    });
    
    const parts = channelName.split('-');
    if (parts.length >= 2) {
        return {
            category: parts[0],
            username: parts[1],
            fullName: channel.name
        };
    }
    
    return null;
}

module.exports = {
    getRolePermissions,
    hasPermissionForCategory,
    isStaffMember,
    canManageChannels,
    getValidRoles,
    createRoleMentions,
    isTicketChannel,
    getTicketInfo
};
