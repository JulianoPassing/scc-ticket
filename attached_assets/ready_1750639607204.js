const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`✅ Bot conectado como ${client.user.tag}!`);
        
        // Registrar comandos slash
        await registerSlashCommands(client);
        
        // Definir status do bot
        client.user.setActivity('Sistema de Tickets | Street CarClub', { type: 'LISTENING' });
        
        console.log(`📊 Bot ativo em ${client.guilds.cache.size} servidor(es)`);
        console.log(`👥 Servindo ${client.users.cache.size} usuários`);
    }
};

async function registerSlashCommands(client) {
    const commands = [];
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    // Carregar todos os comandos
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        commands.push(command.data.toJSON());
    }

    // Registrar comandos via REST API
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('🔄 Registrando comandos slash...');

        // Registrar comandos globalmente ou por guild
        if (process.env.GUILD_ID) {
            // Registro por guild (mais rápido para desenvolvimento)
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
                { body: commands }
            );
            console.log(`✅ Comandos registrados no servidor ${process.env.GUILD_ID}`);
        } else {
            // Registro global (pode demorar até 1 hora para aparecer)
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands }
            );
            console.log('✅ Comandos registrados globalmente');
        }

    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
}
