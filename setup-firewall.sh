#!/bin/bash

echo "🔥 Configurando Firewall para Sistema de Tickets..."

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Verificar se UFW está instalado
if ! command -v ufw &> /dev/null; then
    print_status "Instalando UFW..."
    sudo apt install ufw -y
fi

# Configurar regras básicas
print_status "Configurando regras do firewall..."

# Permitir SSH (importante!)
sudo ufw allow ssh

# Permitir HTTP e HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Permitir porta do servidor web (3010)
sudo ufw allow 3010

# Habilitar firewall
sudo ufw --force enable

# Mostrar status
print_status "Status do firewall:"
sudo ufw status

echo ""
print_warning "Firewall configurado! As portas 22 (SSH), 80 (HTTP), 443 (HTTPS) e 3010 estão abertas." 