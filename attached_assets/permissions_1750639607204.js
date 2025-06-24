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
    
    // Fallback: verificar por nome para compatibilidade
    return Object.keys(config.ticketCategories).some(category => {
        const categoryConfig = config.ticketCategories[category];
        return channel.name.startsWith(`${categoryConfig.emoji}${category}-`) || 
               channel.name.startsWith(`${category}-`);
    });
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
    getValidRoles,
    createRoleMentions,
    isTicketChannel,
    getTicketInfo
};
