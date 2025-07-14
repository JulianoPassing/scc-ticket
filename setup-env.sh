#!/bin/bash

echo "🔧 Configurando arquivo .env..."

# Verificar se o arquivo .env já existe
if [ -f ".env" ]; then
    echo "⚠️  Arquivo .env já existe. Fazendo backup..."
    cp .env .env.backup
fi

# Criar arquivo .env com as credenciais
cat > .env << EOF
# Token do Bot Discord
DISCORD_TOKEN=MTM4NjM3MDA4MzAwNTE0MTA2Mg.GMkdtM.XqBmARB-4ItccigjVB3trzIC0ZjwlInJOktvT4

# Configurações OAuth2 do Discord
DISCORD_CLIENT_ID=1386370083005141062
DISCORD_CLIENT_SECRET=3Xadwq9rfm4GgXBlnmvit_RYHaGhfD8p
DISCORD_CALLBACK_URL=http://localhost:3010/auth/discord/callback

# Configurações do servidor
PORT=3010
SESSION_SECRET=scc-ticket-secret-key-2024

# Ambiente (development/production)
NODE_ENV=production
EOF

echo "✅ Arquivo .env criado com sucesso!"
echo ""
echo "📝 IMPORTANTE: Você ainda precisa:"
echo "1. Configurar URLs de redirect no Discord Developer Portal"
echo "2. Alterar a URL de callback se necessário"
echo ""
echo "Comando para editar: nano .env"
echo ""
echo "🔗 URL de callback configurada:"
echo "   - Desenvolvimento: http://localhost:3010/auth/discord/callback"
echo "   - Produção: http://seu-dominio.com/auth/discord/callback" 