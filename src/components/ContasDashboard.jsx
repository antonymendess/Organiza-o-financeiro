import { supabase } from '../supabaseClient';
import { fmtMoeda, statusContaNoCiclo, contaAtivaNoCiclo, calcularKpisContas, labelMes } from '../utils';

const SITUACAO_LABEL = {
  paga: 'Paga',
  reservada: 'Reservada',
  atrasada: 'Atrasada',
  pendente: 'Pendente',
  agendada: 'Agendada',
  nao_paga_no_mes: 'Não paga naquele mês',
  concluida: 'Concluída'
};
const SITUACAO_CLASSE = {
  paga: 'em_dia',
  reservada: 'negociando',
  atrasada: 'atrasado',
  pendente: 'negociando',
  agendada: 'negociando',
  nao_paga_no_mes: 'atrasado',
  concluida: 'quitado'
};

export default function ContasDashboard({ userId, config, contas, setContas, pagamentos, setPagamentos, ym, onContaPaga }) {
  function dataRefDoCiclo(conta) {
    const [ano, mes] = ym.split('-').map(Number);
    const diaValido = Math.min(conta.dia_vencimento, new Date(ano, mes, 0).getDate());
    return new Date(ano, mes - 1, diaValido).toISOString().slice(0, 10);
  }

  async function marcarPaga(conta) {
    const dataRef = dataRefDoCiclo(conta);
    const { data: novoPagamento, error } = await supabase.from('pagamentos_conta').insert({
      user_id: userId, conta_id: conta.id, valor: conta.valor, ciclo: ym, data: dataRef, tipo: 'pagamento'
    }).select().single();
    if (error) { alert('Erro ao marcar como paga: ' + error.message); return; }
    setPagamentos(prev => [...prev, novoPagamento]);

    const { data: novoLt, error: errorLt } = await supabase.from('lancamentos').insert({
      user_id: userId, tipo: 'despesa', pessoa: conta.pessoa, valor: conta.valor,
      data: dataRef, categoria: conta.categoria, descricao: conta.nome,
      origem_conta_id: conta.id
    }).select().single();
    if (errorLt) { alert('Erro ao lançar despesa: ' + errorLt.message); return; }

    if (onContaPaga) onContaPaga(novoLt);
  }

  async function marcarReservada(conta) {
    const { data: novaReserva, error } = await supabase.from('pagamentos_conta').insert({
      user_id: userId, conta_id: conta.id, valor: conta.valor, ciclo: ym,
      data: new Date().toISOString().slice(0, 10), tipo: 'reserva'
    }).select().single();
    if (error) {
      alert('Erro ao reservar: ' + error.message + '\n\nSe a mensagem falar da coluna "tipo", você precisa rodar o arquivo migracao_reserva.sql no SQL Editor do Supabase.');
      return;
    }
    setPagamentos(prev => [...prev, novaReserva]);
  }

  async function desfazerReserva(conta) {
    const reserva = pagamentos.find(p => p.conta_id === conta.id && p.ciclo === ym && p.tipo === 'reserva');
    if (!reserva) return;
    const { error } = await supabase.from('pagamentos_conta').delete().eq('id', reserva.id);
    if (error) { alert('Erro ao desfazer reserva: ' + error.message); return; }
    setPagamentos(prev => prev.filter(p => p.id !== reserva.id));
  }

  async function desfazerPagamento(conta) {
    const pagamento = pagamentos.find(p => p.conta_id === conta.id && p.ciclo === ym && p.tipo !== 'reserva');
    if (!pagamento) return;
    const { error } = await supabase.from('pagamentos_conta').delete().eq('id', pagamento.id);
    if (error) { alert('Erro ao desfazer pagamento: ' + error.message); return; }
    await supabase.from('lancamentos').delete().eq('origem_conta_id', conta.id).eq('data', pagamento.data);
    setPagamentos(prev => prev.filter(p => p.id !== pagamento.id));
  }

  async function removerConta(id) {
    if (!confirm('Remover esta conta e todo o histórico dela?')) return;
    const { error } = await supabase.from('contas').delete().eq('id', id);
    if (error) { alert('Erro ao remover: ' + error.message); return; }
    setContas(prev => prev.filter(c => c.id !== id));
  }

  const kpis = calcularKpisContas(contas, pagamentos, ym);

  const comInfo = contas
    .filter(c => contaAtivaNoCiclo(c, ym))
    .map(c => ({ ...c, ...statusContaNoCiclo(c, pagamentos, ym) }))
    .sort((a, b) => {
      if (a.pago !== b.pago) return a.pago ? 1 : -1;
      return (a.dias ?? 0) - (b.dias ?? 0);
    });

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Minhas contas</h2>
      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 14 }}>Referente a {labelMes(ym)}</div>

      <div className="crm-kpis" style={{ marginBottom: 18 }}>
        <div className="kpi-card">
          <label>Total do mês</label>
          <div className="v mono">{fmtMoeda(kpis.totalMes)}</div>
        </div>
        <div className="kpi-card">
          <label>Já pago</label>
          <div className="v mono" style={{ color: 'var(--teal)' }}>{fmtMoeda(kpis.jaPago)}</div>
        </div>
        <div className="kpi-card">
          <label>Falta pagar</label>
          <div className="v mono">{fmtMoeda(kpis.faltaPagar)}</div>
        </div>
        <div className={`kpi-card ${kpis.atrasadas > 0 ? 'alert' : ''}`}>
          <label>Atrasadas</label>
          <div className="v mono">{kpis.atrasadas}</div>
        </div>
      </div>

      {comInfo.length === 0 ? (
        <div className="empty">Nenhuma conta ativa neste mês. Marque "Repetir todo mês" ao lançar uma despesa pra ela aparecer aqui.</div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th>Conta</th><th>Quem</th><th style={{ textAlign: 'right' }}>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {comInfo.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.nome}{c.titular && <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}> · {c.titular}</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                      {c.categoria}
                      {c.tipo_valor === 'variavel' && ' · cartão'}
                      {c.quantidade_parcelas && ` · ${c.parcelasPagas}/${c.quantidade_parcelas} parcelas`}
                      {!c.quantidade_parcelas && ' · sem prazo'}
                    </div>
                  </td>
                  <td><span className={`tag ${c.pessoa}`}>{c.pessoa === 'eu' ? config.nome_eu : config.nome_esposa}</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmtMoeda(c.valor)}</td>
                  <td className="mono">
                    dia {c.dia_vencimento}
                    {c.situacao === 'atrasada' && <div style={{ fontSize: 11, color: 'var(--brick)' }}>{Math.abs(c.dias)}d atrasada</div>}
                    {c.situacao === 'pendente' && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{c.dias === 0 ? 'hoje' : `em ${c.dias}d`}</div>}
                  </td>
                  <td>
                    <span className={`status-pill ${SITUACAO_CLASSE[c.situacao]}`}>{SITUACAO_LABEL[c.situacao]}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!c.concluida && !c.pago && c.situacao !== 'reservada' && (
                      <button className="del-btn" style={{ color: 'var(--gold)' }} onClick={() => marcarReservada(c)}>reservar</button>
                    )}
                    {c.situacao === 'reservada' && (
                      <button className="del-btn" onClick={() => desfazerReserva(c)} style={{ marginRight: 8 }}>desfazer reserva</button>
                    )}
                    {!c.concluida && !c.pago && (
                      <button className="del-btn" style={{ color: 'var(--teal)', marginLeft: 8 }} onClick={() => marcarPaga(c)}>marcar pago</button>
                    )}
                    {c.pago && (
                      <button className="del-btn" onClick={() => desfazerPagamento(c)}>desfazer</button>
                    )}
                    <button className="del-btn" style={{ marginLeft: 8 }} onClick={() => removerConta(c.id)}>excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
