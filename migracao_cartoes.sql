-- ============================================================
-- MIGRAÇÃO: só rode este arquivo se você JÁ executou o schema.sql
-- original antes (ou seja, a tabela "credores" já existe no seu
-- Supabase). Se ainda não rodou nada, ignore este arquivo e rode
-- só o schema.sql normalmente — ele já vem atualizado.
-- ============================================================

alter table credores add column if not exists titular text;
alter table credores add column if not exists tipo_divida text not null default 'parcelado';
alter table credores add constraint credores_tipo_divida_check check (tipo_divida in ('parcelado','rotativo'));
alter table credores add column if not exists limite numeric;
alter table credores add column if not exists valor_fatura_atual numeric default 0;

alter table credores alter column valor_total drop not null;
alter table credores alter column valor_parcela drop not null;
alter table credores alter column quantidade_parcelas drop not null;

create table if not exists faturas_cartao (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  credor_id uuid references credores(id) on delete cascade not null,
  ano_mes text not null,
  valor numeric not null,
  paga boolean not null default false,
  data_pagamento date,
  created_at timestamptz default now()
);

alter table faturas_cartao enable row level security;
create policy "acesso_proprio" on faturas_cartao for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
