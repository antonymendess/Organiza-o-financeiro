-- ============================================================
-- Schema completo: Meta de poupança + Contas a pagar (unificado)
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (uso em instalação nova / do zero)
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
-- LANÇAMENTOS (aportes, despesas e rendas avulsas do fluxo de caixa)
-- origem_conta_id: se a despesa foi gerada ao marcar uma "conta"
-- (ver abaixo) como paga, fica registrado aqui pra entrar nos
-- gráficos e no resumo do mês.
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
  origem_conta_id uuid,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- CONTAS: tela única de tudo que você precisa pagar —
-- contas fixas (aluguel, assinatura), compras parceladas
-- (financiamento, parcelamento) e cartões de crédito (fatura
-- que varia todo mês). Sem status de negociação, só controle.
--
-- tipo_valor = 'fixo'     -> valor não muda (aluguel, parcela fixa)
-- tipo_valor = 'variavel' -> valor muda todo ciclo (cartão de crédito)
--
-- quantidade_parcelas: deixe em branco se não tem fim (aluguel,
-- assinatura). Preencha se for algo com prazo (ex: 10x).
-- Só faz sentido para tipo_valor = 'fixo'.
-- ------------------------------------------------------------
create table contas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  nome text not null,
  titular text, -- de quem é a conta (ex: "Mãe"). Pode ficar em branco.
  categoria text not null default 'Outros',
  pessoa text not null check (pessoa in ('eu','esposa')),
  tipo_valor text not null default 'fixo' check (tipo_valor in ('fixo','variavel')),
  valor numeric not null default 0,
  quantidade_parcelas int,
  dia_vencimento int not null,
  data_inicio date not null default current_date,
  ativa boolean not null default true,
  observacoes text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Histórico de pagamentos de cada conta (um registro por ciclo
-- pago). "ciclo" no formato 'YYYY-MM'.
-- ------------------------------------------------------------
create table pagamentos_conta (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  conta_id uuid references contas(id) on delete cascade not null,
  valor numeric not null,
  data date not null default current_date,
  ciclo text not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- SEGURANÇA: cada usuário só vê e mexe nos próprios dados
-- ------------------------------------------------------------
alter table configuracoes enable row level security;
alter table lancamentos enable row level security;
alter table contas enable row level security;
alter table pagamentos_conta enable row level security;

create policy "acesso_proprio" on configuracoes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on lancamentos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on contas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on pagamentos_conta for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
