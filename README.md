# Sistema de Tickets StreetCarClub

Sistema completo de tickets que permite responder tanto pelo Discord quanto por uma interface web.

## Funcionalidades

- ✅ Criação de tickets via Discord
- ✅ Resposta de tickets pelo Discord
- ✅ Interface web para gerenciar tickets
- ✅ Resposta de tickets via web
- ✅ Sincronização em tempo real entre Discord e web
- ✅ WebSocket para atualizações instantâneas
- ✅ Sistema de categorias de tickets
- ✅ Logs de atividades

## Instalação na VPS (Debian/Ubuntu)

### 1. Atualizar o sistema
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Instalar Node.js e npm
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Instalar PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

### 4. Instalar Nginx (opcional, para proxy reverso)
```bash
sudo apt install nginx -y
```

### 5. Clonar ou fazer upload do projeto
```bash
# Se usando git:
git clone <seu-repositorio>
cd scc-ticket

# Ou fazer upload via SFTP/SCP
```

### 6. Instalar dependências
```bash
npm install
```

### 7. Configurar variáveis de ambiente
```bash
cp .env.example .env
nano .env
```

Adicione suas configurações:
```env
# Token do Bot Discord
DISCORD_TOKEN=seu_token_do_bot

# Configurações OAuth2 do Discord
DISCORD_CLIENT_ID=seu_client_id
DISCORD_CLIENT_SECRET=seu_client_secret
DISCORD_CALLBACK_URL=http://seu-dominio.com/auth/discord/callback

# Configurações do servidor
PORT=3010
SESSION_SECRET=sua_chave_secreta_para_sessao

# Ambiente
NODE_ENV=production
```

### 8. Configurar Discord OAuth2

1. Acesse [Discord Developer Portal](https://discord.com/developers/applications)
2. Crie uma nova aplicação ou use uma existente
3. Vá para "OAuth2" → "General"
4. Copie o **Client ID** e **Client Secret**
5. Em "OAuth2" → "Redirects", adicione:
   - `http://localhost:3010/auth/discord/callback` (desenvolvimento)
   - `http://seu-dominio.com/auth/discord/callback` (produção)
6. Em "Bot", copie o **Token**

### 9. Criar pasta de logs
```bash
mkdir logs
```

### 10. Iniciar com PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 11. Configurar Nginx (opcional)
```bash
sudo nano /etc/nginx/sites-available/scc-tickets
```

Adicione:
```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar o site:
```bash
sudo ln -s /etc/nginx/sites-available/scc-tickets /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Comandos Úteis

### Gerenciar o processo
```bash
# Ver status
pm2 status

# Ver logs
pm2 logs scc-ticket-bot

# Reiniciar
pm2 restart scc-ticket-bot

# Parar
pm2 stop scc-ticket-bot

# Iniciar
pm2 start scc-ticket-bot
```

### Atualizar o código
```bash
# Parar o processo
pm2 stop scc-ticket-bot

# Fazer upload das alterações
# ...

# Instalar novas dependências (se houver)
npm install

# Reiniciar
pm2 start scc-ticket-bot
```

## Estrutura do Projeto

```
scc-ticket/
├── server.js              # Servidor principal (Discord + Web)
├── index.js               # Bot Discord original
├── commands/              # Comandos do Discord
├── events/                # Eventos do Discord
├── utils/                 # Utilitários
├── public/                # Interface web
│   └── index.html         # Página principal
├── package.json           # Dependências
├── ecosystem.config.js    # Configuração PM2
└── .env                   # Variáveis de ambiente
```

## API Endpoints

- `GET /api/tickets` - Lista todos os tickets
- `GET /api/tickets/:id` - Obtém dados de um ticket específico
- `GET /api/tickets/:id/messages` - Obtém mensagens de um ticket
- `POST /api/tickets/:id/messages` - Envia mensagem para um ticket

## Como Usar

1. **Discord**: Use os comandos normais do bot
2. **Web**: Acesse `http://seu-ip:3010` ou `http://seu-dominio.com`
3. **Login**: Faça login com sua conta Discord (deve ser membro do servidor com cargo específico)
4. **Sincronização**: As mensagens aparecem automaticamente em ambos os lugares

## Requisitos de Acesso

- ✅ Ser membro do servidor StreetCarClub (ID: 1046404063287332936)
- ✅ Ter o cargo de Atendente (ID: 1046404063673192546) ou superior
- ✅ Conta Discord verificada

## Troubleshooting

### Bot não conecta
- Verifique se o token está correto no `.env`
- Confirme se o bot tem as permissões necessárias

### Web não carrega
- Verifique se a porta 3010 está aberta
- Confirme se o PM2 está rodando: `pm2 status`

### Mensagens não sincronizam
- Verifique os logs: `pm2 logs scc-ticket-bot`
- Confirme se o WebSocket está funcionando

### Erro de permissão
```bash
sudo chown -R $USER:$USER /caminho/do/projeto
```

## Suporte

Para suporte, abra um ticket no Discord ou entre em contato com a equipe. 