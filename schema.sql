-- ============================================================
-- Schema completo: Meta & Fluxo + CRM de Cobrança
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- CONFIGURAÇÕES (meta de poupança geral)
-- ------------------------------------------------------------
create table configuracoes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  meta_valor numeric not null default 70000,
  data_inicio date not null default current_date,
  data_fim date not null,
  nome_eu text not null default 'Eu',
  nome_esposa text not null default 'Esposa',
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- LANÇAMENTOS (aportes, despesas e rendas do fluxo de caixa)
-- ------------------------------------------------------------
create table lancamentos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  tipo text not null check (tipo in ('aporte','despesa','renda')),
  pessoa text not null check (pessoa in ('eu','esposa')),
  valor numeric not null,
  data date not null,
  descricao text,
  categoria text,
  recorrente boolean default false,
  origem_recorrente_id uuid,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- RECORRENTES (contas fixas do fluxo de caixa geral)
-- ------------------------------------------------------------
create table recorrentes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  tipo text not null check (tipo in ('despesa','renda')),
  pessoa text not null check (pessoa in ('eu','esposa')),
  valor numeric not null,
  categoria text,
  descricao text,
  dia_vencimento int not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- CRM DE COBRANÇA: credores / dívidas
-- tipo_divida = 'parcelado'  -> empréstimo, financiamento, compra parcelada (valor fixo)
-- tipo_divida = 'rotativo'   -> cartão de crédito com fatura que varia todo mês
-- ------------------------------------------------------------
create table credores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  nome text not null,
  titular text, -- de quem é o cartão/conta (ex: "Mãe", "Meu nome"). Pode ficar em branco.
  categoria text not null default 'Outros', -- Cartão, Empréstimo, Loja, Financiamento, Outros
  tipo_divida text not null default 'parcelado' check (tipo_divida in ('parcelado','rotativo')),

  -- campos usados quando tipo_divida = 'parcelado'
  valor_total numeric,
  valor_parcela numeric,
  quantidade_parcelas int,
  parcelas_pagas int not null default 0,

  -- campos usados quando tipo_divida = 'rotativo' (cartão de crédito)
  limite numeric,
  valor_fatura_atual numeric default 0,

  -- campos comuns aos dois tipos
  dia_vencimento int not null,
  taxa_juros numeric default 0,
  status text not null default 'em_dia' check (status in ('em_dia','atrasado','negociando','quitado')),
  contato text,
  observacoes text,
  data_inicio date not null default current_date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Faturas mensais dos cartões rotativos (histórico do valor de cada mês)
-- ------------------------------------------------------------
create table faturas_cartao (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  credor_id uuid references credores(id) on delete cascade not null,
  ano_mes text not null, -- formato 'YYYY-MM'
  valor numeric not null,
  paga boolean not null default false,
  data_pagamento date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Histórico de pagamentos de cada dívida
-- ------------------------------------------------------------
create table pagamentos_divida (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  credor_id uuid references credores(id) on delete cascade not null,
  valor numeric not null,
  data date not null default current_date,
  parcela_numero int,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Histórico de negociação com credores
-- ------------------------------------------------------------
create table historico_negociacao (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  credor_id uuid references credores(id) on delete cascade not null,
  data date not null default current_date,
  descricao text not null,
  proximo_contato date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- SEGURANÇA: cada usuário só vê e mexe nos próprios dados
-- ------------------------------------------------------------
alter table configuracoes enable row level security;
alter table lancamentos enable row level security;
alter table recorrentes enable row level security;
alter table credores enable row level security;
alter table pagamentos_divida enable row level security;
alter table historico_negociacao enable row level security;
alter table faturas_cartao enable row level security;

create policy "acesso_proprio" on configuracoes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on lancamentos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on recorrentes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on credores for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on pagamentos_divida for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on historico_negociacao for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on faturas_cartao for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
