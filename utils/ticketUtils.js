const config = require('../config.js');

/**
 * Detecta a categoria de um ticket baseado no nome do canal
 * @param {string} channelName - Nome do canal do ticket
 * @returns {Object} Objeto com category e emoji
 */
function detectTicketCategory(channelName) {
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
    
    // Se ainda não encontrou, verificar se contém o emoji em qualquer lugar do nome
    if (!currentCategory) {
        for (const [categoryKey, categoryConfig] of Object.entries(config.ticketCategories)) {
            if (channelName.includes(categoryConfig.emoji)) {
                currentCategory = categoryKey;
                currentEmoji = categoryConfig.emoji;
                break;
            }
        }
    }
    
    // Se ainda não encontrou, verificar se contém a categoria em qualquer lugar do nome
    if (!currentCategory) {
        for (const [categoryKey, categoryConfig] of Object.entries(config.ticketCategories)) {
            if (channelName.includes(categoryKey)) {
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

/**
 * Prepara o nome final de um ticket mantendo o ícone da categoria
 * @param {string} newName - Novo nome fornecido pelo usuário
 * @param {string} currentEmoji - Emoji da categoria atual
 * @returns {string} Nome final com emoji
 */
function prepareTicketName(newName, currentEmoji) {
    let finalNewName = newName;
    
    // Se o novo nome não começa com o emoji da categoria, adicionar
    if (!finalNewName.startsWith(currentEmoji)) {
        finalNewName = currentEmoji + finalNewName;
    }
    
    return finalNewName;
}

module.exports = {
    detectTicketCategory,
    prepareTicketName
}; 