# 🚀 Configuração Rápida - Sistema de Tickets

## ✅ Credenciais Discord OAuth2 Configuradas

- **Client ID**: `1386370083005141062`
- **Client Secret**: `3Xadwq9rfm4GgXBlnmvit_RYHaGhfD8p`

## 📋 Passos para Configurar na VPS

### 1. **Configurar arquivo .env**
```bash
# Tornar script executável
chmod +x setup-env.sh

# Executar configuração automática (já inclui o token)
./setup-env.sh
```

### 2. **Conteúdo do arquivo .env**
```env
# Token do Bot Discord (CONFIGURADO)
DISCORD_TOKEN=MTM4NjM3MDA4MzAwNTE0MTA2Mg.GMkdtM.XqBmARB-4ItccigjVB3trzIC0ZjwlInJOktvT4

# Configurações OAuth2 do Discord (JÁ CONFIGURADAS)
DISCORD_CLIENT_ID=1386370083005141062
DISCORD_CLIENT_SECRET=3Xadwq9rfm4GgXBlnmvit_RYHaGhfD8p
DISCORD_CALLBACK_URL=http://localhost:3010/auth/discord/callback

# Configurações do servidor
PORT=3010
SESSION_SECRET=scc-ticket-secret-key-2024
NODE_ENV=production
```

### 3. **Configurar Discord Developer Portal**

1. Acesse: https://discord.com/developers/applications
2. Selecione sua aplicação
3. Vá em **OAuth2** → **Redirects**
4. Adicione as URLs:
   ```
   http://localhost:3010/auth/discord/callback
   http://seu-ip:3010/auth/discord/callback
   http://seu-dominio.com/auth/discord/callback
   ```

### 4. **Instalar e Iniciar**
```bash
# Instalar dependências
npm install

# Criar pasta de logs
mkdir logs

# Iniciar com PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Verificar status
pm2 status
```

### 5. **Configurar Firewall**
```bash
# Permitir porta 3010
sudo ufw allow 3010

# Verificar status
sudo ufw status
```

## 🔗 URLs de Acesso

- **Local**: `http://localhost:3010`
- **VPS**: `http://seu-ip:3010`
- **Domínio**: `http://seu-dominio.com`

## 🛡️ Requisitos de Acesso

- ✅ Ser membro do servidor StreetCarClub (ID: 1046404063287332936)
- ✅ Ter o cargo de Atendente (ID: 1046404063673192546)
- ✅ Conta Discord verificada

## 📝 Comandos Úteis

```bash
# Ver logs
pm2 logs scc-ticket-bot

# Reiniciar
pm2 restart scc-ticket-bot

# Parar
pm2 stop scc-ticket-bot

# Ver status
pm2 status
```

## 🔧 Troubleshooting

### Erro de autenticação
- Verifique se o token do bot está correto
- Confirme se as URLs de redirect estão configuradas no Discord
- Verifique se o usuário tem o cargo necessário

### Erro de conexão
- Verifique se a porta 3010 está aberta
- Confirme se o PM2 está rodando
- Verifique os logs: `pm2 logs scc-ticket-bot`

## ✅ Checklist Final

- [x] Token do bot adicionado no .env
- [ ] URLs de redirect configuradas no Discord
- [ ] Dependências instaladas (npm install)
- [ ] PM2 iniciado e salvo
- [ ] Firewall configurado
- [ ] Teste de acesso realizado

---

**🎯 Sistema pronto para uso!** 