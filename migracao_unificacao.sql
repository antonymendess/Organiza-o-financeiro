-- ============================================================
-- MIGRAÇÃO: unifica "contas fixas" e "CRM de credores" numa
-- única tabela "contas". Rode isso se seu app já está no ar.
--
-- Este script SÓ ADICIONA — não apaga nenhuma tabela antiga.
-- Suas contas fixas (recorrentes) já cadastradas são copiadas
-- automaticamente para a nova tabela "contas". Se você tinha
-- algum credor cadastrado no CRM antigo, ele NÃO é copiado
-- automaticamente (o conceito mudou) — é rápido recadastrar
-- manualmente na nova tela unificada.
-- ============================================================

create table if not exists contas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  nome text not null,
  titular text,
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

create table if not exists pagamentos_conta (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  conta_id uuid references contas(id) on delete cascade not null,
  valor numeric not null,
  data date not null default current_date,
  ciclo text not null,
  created_at timestamptz default now()
);

alter table lancamentos add column if not exists origem_conta_id uuid;

-- Garante que a tabela antiga "recorrentes" tenha essas colunas,
-- caso você ainda não tivesse rodado a migração anterior.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'recorrentes') then
    alter table recorrentes add column if not exists quantidade_parcelas int;
    alter table recorrentes add column if not exists data_inicio date not null default current_date;
  end if;
end $$;

alter table contas enable row level security;
alter table pagamentos_conta enable row level security;
create policy "acesso_proprio" on contas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "acesso_proprio" on pagamentos_conta for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Copia as contas fixas (recorrentes) que você já tinha cadastrado
-- pra dentro da nova tabela unificada "contas", se a tabela antiga existir.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'recorrentes') then
    insert into contas (user_id, nome, categoria, pessoa, tipo_valor, valor, quantidade_parcelas, dia_vencimento, data_inicio, ativa)
    select user_id,
           coalesce(descricao, categoria, 'Conta fixa'),
           coalesce(categoria, 'Outros'),
           pessoa,
           'fixo',
           valor,
           quantidade_parcelas,
           dia_vencimento,
           coalesce(data_inicio, current_date),
           true
    from recorrentes;
  end if;
end $$;
