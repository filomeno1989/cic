# 🚀 Guia de Deploy — CIC Fragrâncias & Glamour
### Vercel (alojamento) + Supabase (base de dados) — 100% no plano gratuito

Este guia coloca o sistema num link permanente que funciona no **tablet, celular e PC**
ao mesmo tempo, com a mesma base de dados para todos os aparelhos.

**Tempo total: ±40 minutos** (uma única vez). Não precisa saber programar —
siga os passos na ordem.

---

## O que vai criar

| Serviço | O que faz | Custo |
|---|---|---|
| **Vercel** | Serve o sistema num link fixo (ex: `cic-loja.vercel.app`) | Grátis (Hobby) |
| **Supabase** | Guarda a base de dados na nuvem (PostgreSQL) | Grátis (500 MB - suficiente para anos) |

Requisitos: uma conta de e-mail e o código do sistema (este pacote).

---

## PARTE 1 — Criar a base de dados no Supabase (±10 min)

1. Entre em **https://supabase.com** → **Start your project** → crie conta (pode usar Google/GitHub).
2. Clique em **New project**:
   - **Name:** `cic-loja`
   - **Database Password:** clique **Generate a password** e **GUARDE esta palavra-passe** num papel/WhatsApp (vai precisar dela 2×).
   - **Region:** escolha **West EU (London)** ou **Central EU (Frankfurt)** — são as mais rápidas para Moçambique.
3. Aguarde ±2 minutos até o projeto ficar pronto.
4. Copiar as ligações: vá a **Project Settings** (engrenagem) → **Database** → secção **Connection string** → aba **URI**:
   - **Connection pooling** (porta `6543`): copie esta → será o `DATABASE_URL`
   - **Direct connection** (porta `5432`): copie esta → será o `DIRECT_URL`
5. Nas duas ligações, substitua `[YOUR-PASSWORD]` pela palavra-passe que guardou no passo 2.

> 💡 Deve ficar parecido com:
> `postgresql://postgres.abc123xyz:SUA_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10`
> **Nota:** na URL pooled (6543) adicione no fim: `?pgbouncer=true&connection_limit=10` (se ainda não tiver).

---

## PARTE 2 — Preparar o código (±5 min)

1. O código já está no repositório **https://github.com/filomeno1989/cic** — se precisar dele no computador, use o botão verde **Code → Download ZIP** (ou `git clone`).
2. O ficheiro `prisma/schema.prisma` **já está configurado para PostgreSQL** (não mexa).
3. Crie um ficheiro chamado `.env` dentro da pasta (pode copiar o `.env.example`) e preencha:

```
DATABASE_URL=postgresql://postgres.xxx:PASSWORD@...:6543/postgres?pgbouncer=true&connection_limit=10
DIRECT_URL=postgresql://postgres.xxx:PASSWORD@...:5432/postgres
AUTH_SECRET=cole_aqui_um_codigo_secreto
```

4. Para o `AUTH_SECRET`, gere um código aleatório (no terminal do PC):
   - Windows: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Ou peça-me que gero um para si.

---

## PARTE 3 — Criar as tabelas no Supabase (±3 min)

No computador, dentro da pasta do projeto, abra o terminal e rode:

```bash
npm install
npx prisma db push
```

Se terminar sem erros vermelhos, as tabelas estão criadas no Supabase ✅
(Pode confirmar no Supabase → **Table Editor** — vai ver `User`, `Product`, `Sale`, etc.)

---

## PARTE 4 — Colocar no ar na Vercel (±15 min)

### 4.1 — Código já no GitHub ✅
O código completo já está no repositório **https://github.com/filomeno1989/cic** —
não precisa de subir nada manualmente. Passe directamente ao passo 4.2.

> ⚠️ NUNCA suba o ficheiro `.env` para o GitHub — as variáveis vão ser postas na Vercel.

### 4.2 — Importar na Vercel
1. Entre em **https://vercel.com** → entre com a conta GitHub → **Add New… → Project**
2. Encontre o repositório `cic-loja` → **Import**
3. **ANTES de clicar Deploy**, abra **Environment Variables** e adicione as 3 variáveis:

| Name | Value |
|---|---|
| `DATABASE_URL` | a URL pooled (porta 6543) |
| `DIRECT_URL` | a URL directa (porta 5432) |
| `AUTH_SECRET` | o código secreto que gerou |

4. Clique **Deploy** e aguarde ±3 minutos.
5. Vai receber o link do tipo **`https://cic-loja.vercel.app`** 🎉

---

## PARTE 5 — Primeiro acesso (±2 min)

1. Abra o link no celular (ou PC).
2. Como a base de dados está nova, aparece o ecrã **"Configuração inicial"**:
   - Escreva o seu nome, WhatsApp (opcional) e crie o seu **PIN** (4-6 números).
3. Entre com esse PIN → está dentro como **Gerente**.
4. Em **Definições** → confirme nome da loja, telefone, endereço e rodapé do recibo.
5. Em **Recursos Humanos → Funcionários** → crie as contas das suas vendedoras (cada uma com o seu PIN).

> 📲 **No tablet e no celular:** abra o link no navegador → menu do navegador → **"Adicionar ao ecrã principal"**. Fica com um ícone como se fosse uma app instalada.

---

## PARTE 6 — Trazer os dados actuais (opcional, recomendado)

Se já registou produtos/clientes/funcionários no link provisório e os quer manter:

1. No sistema ACTUAL (link provisório): **Definições → Backup → Descarregar Backup** (guarda um `.json`).
2. No sistema NOVO (link da Vercel): **Definições → Backup → Restaurar de Ficheiro** → escolha o `.json`.
3. Confirme e inicie sessão com o PIN que tinha (o backup traz os funcionários).

O mesmo vale de agora em diante: **faça backup 1× por semana** (o sistema avisa se estiver atrasado).

---

## PARTE 7 — Domínio próprio (opcional, ±30 MT/dia)

Quando quiser um endereço tipo `cicfragancias.co.mz` ou `.com`:
1. Compre o domínio (ex: **Registro.mz**, GoDaddy, Namecheap).
2. Na Vercel: **Project → Settings → Domains → Add** → escreva o domínio.
3. A Vercel mostra os registos DNS para configurar no fornecedor do domínio (segue as instruções na tela).
4. O HTTPS é automático. Nada mais muda no sistema.

---

## Custos e limites (plano gratuito)

| Item | Limite grátis | Suficiente? |
|---|---|---|
| Vercel Hobby | Domínio `.vercel.app`, uso pessoal/comercial leve | Sim para 1 loja |
| Supabase Free | 500 MB de BD ≈ centenas de milhares de vendas | Sim por anos |
| Supabase pausa | Projeto pausa após 7 dias de inactividade | Uma venda por semana reactiva. Se parar mais de 7 dias, entre no Supabase e faça **Restore** do projeto |

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Erro ao carregar produtos` / tela sem dados | `DATABASE_URL` errada na Vercel | Confirme a URL pooled (porta 6543) e a password |
| `prisma db push` falha com timeout | Firewall/Rede ou URL directa errada | Confirme a porta 5432 no `DIRECT_URL` |
| Depois de publicar, todos têm de entrar de novo | Mudou o `AUTH_SECRET` | Normal - basta iniciar sessão |
| Fecho de caixa "corta" o dia às 02:00 | (já corrigido) | O sistema usa hora de Maputo no servidor |
| "Sessão expirada" após 30 dias | Cookie de sessão expira | Normal - entrar com o PIN de novo |

---

## Segurança incluída nesta versão

- ✅ **Todas as rotas API protegidas por sessão assinada** (cookie httpOnly + HMAC) — antes, quem descobrisse o link podia chamar as APIs diretamente; agora é impossível sem iniciar sessão.
- ✅ **Papel (Gerente/Caixa) validado no servidor** — o caixa não consegue ver lucro, folha, conciliação nem fazer ações de gerente, mesmo manipulando o navegador.
- ✅ **Autorização de gerente por PIN sem trocar de sessão** — o caixa pede autorização e mantém a própria sessão.
- ✅ Anulação de venda e limpeza de BD continuam a exigir PIN de gerente.
- ✅ Stock decrementado atomicamente — duas vendas simultâneas nunca deixam stock negativo.
- ✅ Troco gravado na base de dados — recibo e fecho de caixa correctos.
- ✅ Vendas offline só são enfileiradas em falha de rede — erros de negócio (stock insuficiente, limite de fiação) aparecem na hora e não ficam presos na fila.
- ✅ Fuso horário de Maputo no servidor — "hoje" começa às 00:00 locais, não às 02:00.
