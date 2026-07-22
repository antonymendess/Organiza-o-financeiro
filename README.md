# Meta70 · Controle & Cobrança

CRM pessoal de controle financeiro (meta de poupança + fluxo de caixa) e
gestão de dívidas com credores. React + Vite + Supabase, feito pra hospedar
de graça na Vercel.

## O que tem aqui

- **Meta & Fluxo**: meta de poupança com prazo, ritmo necessário por mês,
  aportes, despesas, receitas, contas fixas recorrentes, comparativo entre
  duas pessoas, gráficos de categoria/histórico.
- **CRM de Cobrança**: cadastro de credores (cartão, empréstimo, loja,
  financiamento), com dois tipos de dívida — **parcelada** (valor fixo,
  ex: 10x de R$200) e **cartão de crédito rotativo** (fatura que varia
  todo mês). Cada dívida pode ter um "titular" opcional (ex: "Cartão da
  Mãe") pra você identificar de quem é. Tem parcelas/fatura, vencimento,
  status (em dia / atrasado / negociando / quitado), histórico de
  negociação e de faturas, KPIs de dívida total e comprometimento mensal.
- Login por e-mail/senha (Supabase Auth) — só você acessa seus dados.

## Passo 1 — Configurar o Supabase

1. Entre no seu projeto em [supabase.com](https://supabase.com).
2. Vá em **SQL Editor** → **New query**.
3. Abra o arquivo `schema.sql` (nesta pasta), copie todo o conteúdo, cole
   no editor e clique em **Run**. Isso cria todas as tabelas e as regras de
   segurança (cada usuário só vê os próprios dados).
   - Se você já tinha rodado uma versão anterior deste `schema.sql`
     (antes do suporte a cartão de crédito rotativo), rode em vez disso
     o arquivo `migracao_cartoes.sql` — ele só adiciona o que falta, sem
     apagar nada que você já cadastrou.
4. Vá em **Project Settings → API**. Copie:
   - **Project URL** → vai virar `VITE_SUPABASE_URL`
   - **anon public key** → vai virar `VITE_SUPABASE_ANON_KEY`
5. (Opcional, recomendado) Em **Authentication → Providers → Email**,
   você pode desativar a exigência de confirmação de e-mail se quiser
   entrar direto sem clicar em link de confirmação — em
   **Authentication → Settings**, desmarque "Confirm email".

## Passo 2 — Rodar localmente (opcional, pra testar antes)

```bash
npm install
cp .env.example .env
# edite o .env com sua URL e chave do Supabase
npm run dev
```

Abra o endereço que aparecer no terminal (geralmente `http://localhost:5173`).
Crie sua conta pela tela de login ("Não tem conta? Criar uma agora").

## Passo 3 — Subir para o GitHub

```bash
git init
git add .
git commit -m "Meta70 CRM"
```

Crie um repositório novo no GitHub e siga as instruções que ele mostra
para enviar (`git remote add origin ...` e `git push`).

## Passo 4 — Deploy na Vercel

1. Em [vercel.com](https://vercel.com), clique em **Add New → Project**.
2. Selecione o repositório que você acabou de subir.
3. A Vercel detecta automaticamente que é um projeto Vite — não precisa
   mudar nada no build.
4. Antes de clicar em **Deploy**, abra **Environment Variables** e
   adicione:
   - `VITE_SUPABASE_URL` = sua URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = sua chave anon
5. Clique em **Deploy**. Em cerca de 1 minuto você recebe um link
   (`algo.vercel.app`) já funcionando, acessível de qualquer lugar.

## Backup

Dentro do app, em "Ajustar meta, prazo e backup", tem um botão pra baixar
um `.json` com os dados da aba Meta & Fluxo. Como os dados agora moram no
Supabase (não no navegador), formatar o PC não apaga nada — mas vale a
pena, de vez em quando, entrar no **Supabase → Database → Backups** e
conferir se o backup automático do próprio Supabase está ativo no seu
plano.

## Estrutura dos arquivos

```
schema.sql              → rode isso no SQL Editor do Supabase
src/supabaseClient.js   → conexão com o Supabase
src/utils.js            → cálculos (meta, dívidas, datas)
src/components/Login.jsx
src/components/MetaTab.jsx
src/components/CrmTab.jsx
src/App.jsx             → tela principal com as duas abas
```
