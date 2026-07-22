import { supabase } from '../supabaseClient';
import { fmtMoeda, diasParaVencimento, foiPagaNesteCiclo, totalParcelasPagas, calcularKpisContas, cicloAtual } from '../utils';

export default function ContasDashboard({ userId, config, contas, setContas, pagamentos, setPagamentos, onContaPaga }) {
  async function marcarPaga(conta) {
    const ciclo = cicloAtual();
    const { data: novoPagamento } = await supabase.from('pagamentos_conta').insert({
      user_id: userId, conta_id: conta.id, valor: conta.valor, ciclo, data: new Date().toISOString().slice(0, 10)
    }).select().single();
    setPagamentos(prev => [...prev, novoPagamento]);

    const { data: novoLt } = await supabase.from('lancamentos').insert({
      user_id: userId, tipo: 'despesa', pessoa: conta.pessoa, valor: conta.valor,
      data: new Date().toISOString().slice(0, 10), categoria: conta.categoria, descricao: conta.nome,
      origem_conta_id: conta.id
    }).select().single();

    if (onContaPaga) onContaPaga(novoLt);
  }

  async function desfazerPagamento(conta) {
    const ciclo = cicloAtual();
    const pagamento = pagamentos.find(p => p.conta_id === conta.id && p.ciclo === ciclo);
    if (!pagamento) return;
    await supabase.from('pagamentos_conta').delete().eq('id', pagamento.id);
    await supabase.from('lancamentos').delete().eq('origem_conta_id', conta.id).eq('data', pagamento.data);
    setPagamentos(prev => prev.filter(p => p.id !== pagamento.id));
  }

  async function removerConta(id) {
    if (!confirm('Remover esta conta e todo o histórico de pagamentos dela?')) return;
    await supabase.from('contas').delete().eq('id', id);
    setContas(prev => prev.filter(c => c.id !== id));
  }

  const kpis = calcularKpisContas(contas, pagamentos);
  const ciclo = cicloAtual();

  const comInfo = contas.filter(c => c.ativa).map(c => {
    const pago = foiPagaNesteCiclo(c.id, pagamentos, ciclo);
    const dias = diasParaVencimento(c.dia_vencimento);
    const parcelasPagas = totalParcelasPagas(c.id, pagamentos);
    const concluida = c.quantidade_parcelas && parcelasPagas >= c.quantidade_parcelas;
    return { ...c, pago, dias, parcelasPagas, concluida };
  }).sort((a, b) => {
    if (a.pago !== b.pago) return a.pago ? 1 : -1;
    return a.dias - b.dias;
  });

  return (
    <div className="card">
      <h2>Minhas contas</h2>

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
        <div className="empty">Nenhuma conta cadastrada ainda. Marque "Repetir todo mês" ao lançar uma despesa pra ela aparecer aqui.</div>
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
                      {!c.quantidade_parcelas && c.tipo_valor === 'fixo' && ' · sem prazo'}
                    </div>
                  </td>
                  <td><span className={`tag ${c.pessoa}`}>{c.pessoa === 'eu' ? config.nome_eu : config.nome_esposa}</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmtMoeda(c.valor)}</td>
                  <td className="mono">
                    dia {c.dia_vencimento}
                    {!c.pago && !c.concluida && (
                      <div style={{ fontSize: 11, color: c.dias < 0 ? 'var(--brick)' : 'var(--ink-muted)' }}>
                        {c.dias === 0 ? 'hoje' : c.dias > 0 ? `em ${c.dias}d` : `${Math.abs(c.dias)}d atrasada`}
                      </div>
                    )}
                  </td>
                  <td>
                    {c.concluida
                      ? <span className="status-pill quitado">Concluída</span>
                      : c.pago
                        ? <span className="status-pill em_dia">Paga</span>
                        : c.dias < 0
                          ? <span className="status-pill atrasado">Atrasada</span>
                          : <span className="status-pill negociando">Pendente</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!c.concluida && (c.pago
                      ? <button className="del-btn" onClick={() => desfazerPagamento(c)}>desfazer</button>
                      : <button className="del-btn" style={{ color: 'var(--teal)' }} onClick={() => marcarPaga(c)}>marcar pago</button>)}
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
