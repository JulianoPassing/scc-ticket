#!/bin/bash

echo "🚀 Instalando Sistema de Tickets StreetCarClub..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para imprimir mensagens coloridas
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar se está rodando como root
if [[ $EUID -eq 0 ]]; then
   print_error "Este script não deve ser executado como root!"
   exit 1
fi

# 1. Atualizar sistema
print_status "Atualizando sistema..."
sudo apt update && sudo apt upgrade -y

# 2. Instalar Node.js
print_status "Instalando Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    print_warning "Node.js já está instalado"
fi

# 3. Instalar PM2
print_status "Instalando PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    print_warning "PM2 já está instalado"
fi

# 4. Instalar Nginx (opcional)
read -p "Deseja instalar Nginx para proxy reverso? (y/n): " install_nginx
if [[ $install_nginx =~ ^[Yy]$ ]]; then
    print_status "Instalando Nginx..."
    sudo apt install nginx -y
fi

# 5. Verificar se o projeto está no diretório atual
if [ ! -f "package.json" ]; then
    print_error "package.json não encontrado! Certifique-se de estar no diretório do projeto."
    exit 1
fi

# 6. Instalar dependências
print_status "Instalando dependências do projeto..."
npm install

# 7. Criar pasta de logs
print_status "Criando pasta de logs..."
mkdir -p logs

# 8. Verificar arquivo .env
if [ ! -f ".env" ]; then
    print_warning "Arquivo .env não encontrado!"
    echo "Criando arquivo .env..."
    cat > .env << EOF
# Token do Bot Discord
DISCORD_TOKEN=seu_token_aqui

# Configurações OAuth2 do Discord
DISCORD_CLIENT_ID=seu_client_id_aqui
DISCORD_CLIENT_SECRET=seu_client_secret_aqui
DISCORD_CALLBACK_URL=http://localhost:3010/auth/discord/callback

# Configurações do servidor
PORT=3010
SESSION_SECRET=sua_chave_secreta_para_sessao

# Ambiente (development/production)
NODE_ENV=production
EOF
    print_warning "Por favor, edite o arquivo .env e adicione seu token do Discord!"
    echo "Comando: nano .env"
fi

# 9. Configurar permissões
print_status "Configurando permissões..."
sudo chown -R $USER:$USER .

# 10. Testar se o bot pode ser iniciado
print_status "Testando inicialização..."
if pm2 start ecosystem.config.js --no-daemon; then
    print_status "Teste bem-sucedido! Parando processo de teste..."
    pm2 stop scc-ticket-bot
    pm2 delete scc-ticket-bot
else
    print_error "Erro ao testar inicialização. Verifique o arquivo .env"
    exit 1
fi

# 11. Iniciar com PM2
print_status "Iniciando com PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 12. Configurar Nginx se instalado
if command -v nginx &> /dev/null; then
    read -p "Deseja configurar Nginx? (y/n): " config_nginx
    if [[ $config_nginx =~ ^[Yy]$ ]]; then
        read -p "Digite seu domínio (ou IP): " domain
        
        sudo tee /etc/nginx/sites-available/scc-tickets > /dev/null << EOF
server {
    listen 80;
    server_name $domain;

    location / {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
        
        sudo ln -sf /etc/nginx/sites-available/scc-tickets /etc/nginx/sites-enabled/
        sudo nginx -t && sudo systemctl restart nginx
        
        print_status "Nginx configurado para $domain"
    fi
fi

# 13. Mostrar status final
print_status "Instalação concluída!"
echo ""
echo "📋 Status do sistema:"
pm2 status
echo ""
echo "🌐 Acesse:"
echo "   - Local: http://localhost:3010"
if command -v nginx &> /dev/null; then
    echo "   - Web: http://$domain"
fi
echo ""
echo "📝 Comandos úteis:"
echo "   - Ver logs: pm2 logs scc-ticket-bot"
echo "   - Reiniciar: pm2 restart scc-ticket-bot"
echo "   - Parar: pm2 stop scc-ticket-bot"
echo ""
print_warning "IMPORTANTE: Edite o arquivo .env e configure as credenciais do Discord OAuth2!"
echo "Comando: nano .env" 