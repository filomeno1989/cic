# 🔑 RECUPERAÇÃO DE ACESSO — DOCUMENTO PRIVADO DO PROPRIETÁRIO

> **CONFIDENCIAL** — não mostrar à gerente nem partilhar este ficheiro.
> Guarde uma cópia no telemóvel (foto ou nota segura) ANTES de entregar o projeto.

Este documento garante que **o proprietário (Filomeno) recupera SEMPRE o acesso**
ao sistema, mesmo que a gerente mude PINs, archive contas ou ninguém saiba o PIN
do administrador.

---

## 1. A sua chave de manutenção

```
RECOVERY_KEY = c7d7ab417abdfea846f32a5808cad17c2c858a65ddcde9d5
```

- Esta chave dá acesso total de recuperação — trate-a como a chave do cofre.
- Guardar em: gestor de passwords, nota bloqueada, ou impresso em casa.
- Se um dia suspeitar que foi exposta: gere outra (`openssl rand -hex 24`),
  atualize-a na Vercel e guarde a nova.

## 2. Ativação (uma única vez, 2 minutos)

A porta só fica ativa depois de adicionar a variável na Vercel:

1. Vercel → projeto **cic** → **Settings → Environment Variables**
2. Adicione: Nome = `RECOVERY_KEY`, Valor = a chave acima (sem aspas), todos os ambientes
3. **Deployments → último deploy → ⋯ → Redeploy** (a variável só vale após novo deploy)

## 3. Como usar quando perder o acesso

Os comandos abaixo podem ser executados de 3 formas (A, B ou C — escolha a mais fácil).

### Ação 1 — Ver que contas existem (sem mostrar PINs)

```
POST https://SEU-SITE.vercel.app/api/manutencao
{ "chave": "SUA_CHAVE", "acao": "listar" }
```

Resposta exemplo: `{ "ok": true, "contas": [ { "name": "Cleide…", "role": "GERENTE", "active": true }, … ] }`

### Ação 2 — Redefinir o PIN de uma conta existente

```
POST https://SEU-SITE.vercel.app/api/manutencao
{ "chave": "SUA_CHAVE", "acao": "redefinir", "alvo": "Nome Da Conta", "novoPin": "987654" }
```

O nome tem de ser igual ao da listagem (maiúsculas/minúsculas ignoradas).
A conta é também reativada (se estava arquivada). Depois entre com o novo PIN
e troque-o dentro do sistema (RH → Funcionários → Editar).

### Ação 3 — Criar uma conta de gerente nova (plano C, se preferir conta própria)

```
POST https://SEU-SITE.vercel.app/api/manutencao
{ "chave": "SUA_CHAVE", "acao": "criar_gerente", "nome": "Filomeno", "novoPin": "314159" }
```

Entre com esse PIN — terá acesso total de gerente.

### Como executar os comandos

- **A. Pedir ao assistente (Super Z)**: diga "usa a porta de manutenção para listar/redefinir…" —
  eu executo o POST por ti (a chave já está neste documento).
- **B. No PC (terminal ou PowerShell)**:
  `curl -X POST https://SEU-SITE.vercel.app/api/manutencao -H "Content-Type: application/json" -d "{\"chave\":\"...\",\"acao\":\"listar\"}"`
- **C. No navegador do PC**: abra o site, prima F12 → consola → cole:
  ```js
  fetch("/api/manutencao", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chave: "SUA_CHAVE", acao: "listar" }) }).then(r => r.json()).then(console.log);
  ```

## 4. Plano B — Supabase (mesmo sem a chave)

O proprietário tem acesso ao painel do Supabase (donos da base de dados). Lá pode
sempre ver e alterar contas diretamente:

1. Supabase → projeto → **SQL Editor** → New query
2. Ver contas:  `SELECT name, role, active FROM "User" ORDER BY role;`
3. Redefinir PIN de alguém (exemplo para PIN 987654):
   `UPDATE "User" SET pin = '987654', active = true WHERE name = 'Nome Da Conta';`

> A base de dados guarda o PIN em texto simples de propósito: permite esta recuperação.

## 5. Proteções novas contra bloqueio acidental

Implementadas no sistema (a gerente NÃO consegue):

- ❌ Arquivar a própria conta enquanto está a usá-la;
- ❌ Desativar ou rebaixar o **último gerente ativo** (a loja ficaria sem gestão);
- ✅ Se mesmo assim ficarem sem gerentes (ex: SQL manual), a porta `/api/manutencao`
  continua a funcionar — `criar_gerente` cria acesso novo do zero.

## 6. Checklist de entrega do projeto

- [ ] Repo GitHub em **Private**
- [ ] **Revogar** o token GitHub temporário (GitHub → Settings → Developer settings → Tokens)
- [ ] `RECOVERY_KEY` adicionada na Vercel + Redeploy feito
- [ ] Este documento guardado em sítio seguro (2 cópias)
- [ ] backup restaurado na Vercel (dados reais da loja)
- [ ] PIN pessoal testado: sair e voltar a entrar
