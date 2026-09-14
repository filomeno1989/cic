# CIC Fragrâncias & Glamour — Sistema de Gestão

Sistema comercial completo (POS + gestão) para a loja **CIC Fragrâncias & Glamour** — cosméticos e acessórios, Beira · Moçambique. Funciona em **tablet, celular e PC** com a mesma base de dados, e continua a operar **offline** (as vendas ficam em fila e sincronizam sozinhas quando a rede volta).

## Funcionalidades

- **PDV rápido** — grade de variações, preço retalho/grossista automático, desconto com autorização de gerente, suspensão e retoma de vendas
- **Pagamentos locais** — M-Pesa, e-Mola, mKesh, POS e dinheiro com cálculo de troco e referência de transação
- **Fiação (crédito ao cliente)** — controlo de saldo, amortizações parciais e cobrança amigável por WhatsApp
- **Fecho cego de caixa** + conciliação (falta/sobra) visível apenas ao gerente
- **Stock** — entradas, quebras, histórico, alertas de stock mínimo e validade
- **Recursos Humanos** — funcionários com PIN, vales, folha salarial mensal (base + comissões − vales)
- **Relatórios PDF** — vendas, fiação, inventário, despesas e folha (gerados no próprio aparelho)
- **Backup / Restauro** — exportação e importação completa da base de dados em JSON
- **Recibo térmico 58/80mm** + envio por WhatsApp como **imagem**
- **Offline-first** — fila de vendas local com sincronização automática
- **Tema claro/escuro** (branco/cinza/dourado, à medida do logótipo)

## Tecnologia

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma · PostgreSQL (Supabase)

## Deploy (Vercel + Supabase — plano gratuito)

Instruções passo-a-passo em **[deploy/GUIA-DEPLOY.md](deploy/GUIA-DEPLOY.md)**:
1. Criar o projecto no Supabase e copiar as ligações (pooled 6543 + directa 5432)
2. Criar as tabelas (`npx prisma db push`)
3. Importar o repositório na Vercel e definir as variáveis de ambiente
4. Primeiro acesso → ecrã "Configuração inicial" cria a conta do gerente

### Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Ligação PostgreSQL **pooled** (porta 6543) — usada pela aplicação |
| `DIRECT_URL` | Ligação **directa** (porta 5432) — usada nas migrações do Prisma |
| `AUTH_SECRET` | Segredo que assina os cookies de sessão (HMAC) |
| `RECOVERY_KEY` | (Opcional, só o proprietário) ativa a porta de emergência `/api/manutencao` para recuperar acesso — ver `deploy/RECUPERACAO-ACESSO.md` |

Modelo em `.env.example`. **Nunca** commitar o ficheiro `.env` real.

## Segurança

- Todas as rotas API protegidas por sessão assinada (cookie httpOnly + HMAC) — middleware em `src/middleware.ts`
- Papel (Gerente/Caixa) validado **sempre no servidor**
- Autorização de gerente por PIN sem trocar de sessão
- Baixa de stock atómica (sem stock negativo, mesmo com vendas simultâneas)
- Fuso horário de Maputo (Africa/Maputo) no servidor para "hoje"/mês

## Estado do deploy

- **Produção:** https://cic-loja.vercel.app
- Se `/api/health` devolver `URL_INVALID`: o valor na Vercel deve conter SÓ a URL - sem aspas, sem espaços, sem `[YOUR-PASSWORD]`, e apenas um único `?` (ex.: `...postgres?pgbouncer=true&connection_limit=10`).
- Variaveis de ambiente corrigidas via API da Vercel (DATABASE_URL / DIRECT_URL).
