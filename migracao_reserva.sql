-- ============================================================
-- MIGRAÇÃO: adiciona o conceito de "reservado" (dinheiro já
-- separado do salário, mas ainda não debitado) às contas.
-- Rode isso se você já está com o app no ar.
-- ============================================================

alter table pagamentos_conta add column if not exists tipo text not null default 'pagamento';
alter table pagamentos_conta add constraint pagamentos_conta_tipo_check check (tipo in ('pagamento','reserva'));
