# Bot de Vendas Discord

Bot de vendas para Discord com sistema completo de pedidos, estoque e pagamentos PIX.

## Funcionalidades

- `/loja` — Catálogo de produtos com menu de seleção. O cliente escolhe, informa quantidade e recebe o PIX/QR Code no privado
- `/admin` — Painel administrativo completo (só administradores):
  - **Produtos/Estoque** — Criar/editar produtos, configurar PIX e QR Code, gerenciar estoque manual e automático (contas Roblox, etc.)
  - **Pedidos** — Criar vendas, ver pedidos, reenviar PIX, aprovar ou recusar por ID
  - **Configuração** — Nome da loja e confirmador padrão
- `/ajuda` — Ajuda para clientes e staff
- **Fluxo de comprovante** — Cliente responde à DM do bot com a imagem → confirmador recebe com botões Confirmar/Recusar → entrega automática ou manual

## Deploy no Railway

### 1. Criar projeto no Railway
1. Acesse [railway.app](https://railway.app) e crie um novo projeto
2. Conecte ao repositório GitHub
3. O Railway detecta o `railway.toml` automaticamente

### 2. Variáveis de ambiente obrigatórias
Configure no painel do Railway em **Variables**:

| Variável | Descrição |
|----------|-----------|
| `DISCORD_BOT_TOKEN` | Token do seu bot (discord.com/developers) |

> `PORT` é configurado automaticamente pelo Railway.

### 3. Deploy
O Railway faz build e deploy automático a cada push no GitHub.

## Desenvolvimento local

```bash
# Instalar dependências
pnpm install

# Rodar em desenvolvimento
pnpm --filter @workspace/api-server run dev
```

## Stack

- Node.js 20 + TypeScript
- discord.js v14
- Express 5
- Dados salvos em JSON (pasta `data/` — não commitada)

## Configuração inicial após deploy

1. Use `/admin` → **Configuração** → defina o nome da loja e o confirmador padrão
2. Use `/admin` → **Produtos/Estoque** → **Criar/Editar produto** para cadastrar seus produtos
3. Para produtos manuais: configure o PIX/QR em **PIX / QR do produto**
4. Para produtos automáticos (contas): adicione as contas em **Adicionar conta automática**
