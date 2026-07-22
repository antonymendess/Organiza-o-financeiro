# Meta70 · Minhas Contas

App pessoal de controle financeiro numa tela única: meta de poupança,
fluxo de caixa e todas as suas contas a pagar (fixas, parceladas ou
cartão de crédito) — sem abas, sem status de negociação, só controle
direto de quanto você vai pagar. React + Vite + Supabase, hospedado de
graça na Vercel.

## O que tem aqui

Tudo numa página só, sem abas:

- **Meta de poupança**: valor alvo, prazo, ritmo necessário por mês,
  aportes, comparativo entre duas pessoas.
- **Cadastro único**: um só formulário (+Aporte / +Despesa / +Renda)
  pra tudo. Ao lançar uma despesa, marcando "Repetir todo mês" ela vira
  automaticamente uma conta recorrente — com quantidade de parcelas
  opcional (em branco = sem fim) e a opção de escolher a partir de qual
  mês ela deve começar a contar (útil se você já pagou o mês atual e só
  quer que passe a valer do mês que vem em diante).
- **Resumo do mês**: receita, despesa, saldo, e gráficos de categoria.
- **Minhas contas**: um mini-dashboard com tudo que você cadastrou como
  recorrente — total do mês, já pago, falta pagar, atrasadas — e uma
  lista compacta pra marcar cada uma como paga.
- **Histórico**: gráficos dos últimos 6 meses.
- **Lançamentos**: extrato completo com filtro por pessoa, mês e categoria.
- Login por e-mail/senha (Supabase Auth) — só você acessa seus dados.

## Passo 1 — Configurar o Supabase

1. Entre no seu projeto em [supabase.com](https://supabase.com).
2. Vá em **SQL Editor** → **New query**.
3. Se for uma instalação nova (projeto Supabase vazio), rode o
   `schema.sql` inteiro.
4. Se você já tinha o app rodando com uma versão anterior (CRM de
   credores com negociação, ou contas fixas separadas), rode em vez
   disso o `migracao_unificacao.sql` — ele cria as tabelas novas e
   copia suas contas fixas já cadastradas pra dentro da nova estrutura,
   sem apagar nada.
5. Vá em **Project Settings → API**. Copie:
   - **Project URL** → vai virar `VITE_SUPABASE_URL`
   - **anon public key** → vai virar `VITE_SUPABASE_ANON_KEY`

## Passo 2 — Rodar localmente (opcional, pra testar antes)

```bash
npm install
cp .env.example .env
# edite o .env com sua URL e chave do Supabase
npm run dev
```

## Passo 3 — Subir pro GitHub

Se já tem um repositório: suba os arquivos atualizados (certifique-se
de que a pasta `src/` inteira, com todos os componentes, foi enviada).

Se for do zero:
```bash
git init
git add .
git commit -m "Meta70 unificado"
```
Crie um repositório no GitHub e siga as instruções de `git remote add
origin ...` / `git push`.

## Passo 4 — Deploy na Vercel

1. Em [vercel.com](https://vercel.com), importe o repositório.
2. Confirme que o **Root Directory** aponta pra pasta que contém o
   `package.json` (se você subiu a pasta do projeto como subpasta do
   repo, ajuste isso em Settings → General → Root Directory).
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY` (marcando Production, Preview e
   Development).
4. Clique em **Deploy**.

## Backup

Dentro do app, em "Ajustar meta, prazo e backup", tem um botão pra
baixar um `.json` com os dados de meta e lançamentos avulsos.

## Estrutura dos arquivos

```
schema.sql                  → instalação nova, rode no SQL Editor
migracao_unificacao.sql     → se já tinha o app rodando antes
src/supabaseClient.js       → conexão com o Supabase
src/utils.js                → cálculos (meta, contas, datas)
src/components/Login.jsx
src/components/MetaTab.jsx          → meta + cadastro único + resumo + histórico + lançamentos
src/components/ContasDashboard.jsx  → mini-dashboard de contas a pagar
src/App.jsx                  → carrega os dados e monta a tela única
```
