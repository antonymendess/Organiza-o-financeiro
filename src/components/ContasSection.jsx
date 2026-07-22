import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fmtMoeda, diasParaVencimento, foiPagaNesteCiclo, totalParcelasPagas, calcularKpisContas, cicloAtual } from '../utils';

const CATEGORIAS = ['Moradia', 'Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Assinaturas', 'Cartão', 'Empréstimo', 'Loja', 'Financiamento', 'Outros'];

export default function ContasSection({ userId, config, onContaPaga }) {
  const [contas, setContas] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [filtro, setFiltro] = useState('todas');
  const [edicaoValor, setEdicaoValor] = useState({});

  const vazio = {
    nome: '', titular: '', categoria: CATEGORIAS[0], pessoa: 'eu', tipo_valor: 'fixo',
    valor: '', quantidade_parcelas: '', dia_vencimento: 5, observacoes: ''
  };
  const [form, setForm] = useState(vazio);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    const { data: cs } = await supabase.from('contas').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    const { data: ps } = await supabase.from('pagamentos_conta').select('*').eq('user_id', userId);
    setContas(cs || []);
    setPagamentos(ps || []);
    setCarregando(false);
  }

  async function handleAddConta(e) {
    e.preventDefault();
    const payload = {
      user_id: userId,
      nome: form.nome,
      titular: form.titular || null,
      categoria: form.categoria,
      pessoa: form.pessoa,
      tipo_valor: form.tipo_valor,
      valor: Number(form.valor) || 0,
      quantidade_parcelas: form.tipo_valor === 'fixo' && form.quantidade_parcelas ? Number(form.quantidade_parcelas) : null,
      dia_vencimento: Number(form.dia_vencimento),
      observacoes: form.observacoes,
      ativa: true
    };
    const { data: nova, error } = await supabase.from('contas').insert(payload).select().single();
    if (error) { alert('Erro ao cadastrar: ' + error.message); return; }
    setContas(prev => [nova, ...prev]);
    setForm(vazio);
    setFormAberto(false);
  }

  async function marcarPaga(conta) {
    const ciclo = cicloAtual();
    const valorPago = conta.tipo_valor === 'variavel' && edicaoValor[conta.id] !== undefined
      ? Number(edicaoValor[conta.id]) : Number(conta.valor);

    const { data: novoPagamento } = await supabase.from('pagamentos_conta').insert({
      user_id: userId, conta_id: conta.id, valor: valorPago, ciclo, data: new Date().toISOString().slice(0, 10)
    }).select().single();
    setPagamentos(prev => [...prev, novoPagamento]);

    const { data: novoLt } = await supabase.from('lancamentos').insert({
      user_id: userId, tipo: 'despesa', pessoa: conta.pessoa, valor: valorPago,
      data: new Date().toISOString().slice(0, 10), categoria: conta.categoria, descricao: conta.nome,
      origem_conta_id: conta.id
    }).select().single();

    if (conta.tipo_valor === 'variavel' && edicaoValor[conta.id] !== undefined) {
      const { data: contaAtualizada } = await supabase.from('contas').update({ valor: valorPago }).eq('id', conta.id).select().single();
      setContas(prev => prev.map(c => c.id === conta.id ? contaAtualizada : c));
      setEdicaoValor(prev => ({ ...prev, [conta.id]: undefined }));
    }

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

  async function pausarConta(id) {
    const { data: atualizada } = await supabase.from('contas').update({ ativa: false }).eq('id', id).select().single();
    setContas(prev => prev.map(c => c.id === id ? atualizada : c));
  }

  async function reativarConta(id) {
    const { data: atualizada } = await supabase.from('contas').update({ ativa: true }).eq('id', id).select().single();
    setContas(prev => prev.map(c => c.id === id ? atualizada : c));
  }

  async function removerConta(id) {
    if (!confirm('Remover esta conta e todo o histórico de pagamentos dela? Essa ação não pode ser desfeita.')) return;
    await supabase.from('contas').delete().eq('id', id);
    setContas(prev => prev.filter(c => c.id !== id));
  }

  if (carregando) return <div className="empty">Carregando suas contas...</div>;

  const kpis = calcularKpisContas(contas, pagamentos);
  const ciclo = cicloAtual();

  const comInfo = contas.map(c => {
    const pago = foiPagaNesteCiclo(c.id, pagamentos, ciclo);
    const dias = diasParaVencimento(c.dia_vencimento);
    const parcelasPagas = totalParcelasPagas(c.id, pagamentos);
    const concluida = c.tipo_valor === 'fixo' && c.quantidade_parcelas && parcelasPagas >= c.quantidade_parcelas;
    return { ...c, pago, dias, parcelasPagas, concluida };
  });

  let listaFiltrada = comInfo;
  if (filtro === 'pendentes') listaFiltrada = comInfo.filter(c => c.ativa && !c.pago && !c.concluida);
  if (filtro === 'atrasadas') listaFiltrada = comInfo.filter(c => c.ativa && !c.pago && c.dias < 0 && !c.concluida);
  if (filtro === 'pagas') listaFiltrada = comInfo.filter(c => c.pago);
  if (filtro === 'pausadas') listaFiltrada = comInfo.filter(c => !c.ativa);
  if (filtro === 'todas') listaFiltrada = comInfo.filter(c => c.ativa);

  const ordenada = [...listaFiltrada].sort((a, b) => {
    if (a.pago !== b.pago) return a.pago ? 1 : -1;
    return a.dias - b.dias;
  });

  return (
    <div>
      <div className="crm-kpis">
        <div className="kpi-card">
          <label>Total a pagar este mês</label>
          <div className="v mono">{fmtMoeda(kpis.totalMes)}</div>
        </div>
        <div className="kpi-card">
          <label>Já pago este mês</label>
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

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formAberto ? 16 : 0 }}>
          <h2 style={{ margin: 0 }}>Minhas contas</h2>
          <button className="btn-secondary" onClick={() => setFormAberto(!formAberto)}>
            {formAberto ? 'Cancelar' : '+ Nova conta'}
          </button>
        </div>

        {formAberto && (
          <form onSubmit={handleAddConta} style={{ marginTop: 6 }}>
            <div className="row2">
              <div><label>Nome da conta</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="ex: Aluguel, Cartão Nubank" required /></div>
              <div><label>De quem é (opcional)</label><input value={form.titular} onChange={e => setForm({ ...form, titular: e.target.value })} placeholder="ex: Mãe, Meu nome" /></div>
            </div>
            <div className="row3">
              <div>
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Quem paga</label>
                <select value={form.pessoa} onChange={e => setForm({ ...form, pessoa: e.target.value })}>
                  <option value="eu">{config.nome_eu}</option>
                  <option value="esposa">{config.nome_esposa}</option>
                </select>
              </div>
              <div>
                <label>Tipo</label>
                <select value={form.tipo_valor} onChange={e => setForm({ ...form, tipo_valor: e.target.value })}>
                  <option value="fixo">Valor fixo</option>
                  <option value="variavel">Varia todo mês (cartão)</option>
                </select>
              </div>
            </div>
            <div className="row3">
              <div><label>{form.tipo_valor === 'variavel' ? 'Valor deste mês (R$)' : 'Valor da parcela/mensalidade (R$)'}</label>
                <input type="number" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} required />
              </div>
              {form.tipo_valor === 'fixo' && (
                <div><label>Quantidade de parcelas (em branco = sem fim)</label>
                  <input type="number" min="1" placeholder="ex: 12" value={form.quantidade_parcelas} onChange={e => setForm({ ...form, quantidade_parcelas: e.target.value })} />
                </div>
              )}
              <div><label>Dia do vencimento</label><input type="number" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm({ ...form, dia_vencimento: e.target.value })} required /></div>
            </div>
            <div><label>Observações (opcional)</label><textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })}></textarea></div>
            <button className="btn-primary" type="submit">Cadastrar conta</button>
          </form>
        )}
      </div>

      <div className="filters">
        <button className={`chip ${filtro === 'todas' ? 'active' : ''}`} onClick={() => setFiltro('todas')}>Ativas</button>
        <button className={`chip ${filtro === 'pendentes' ? 'active' : ''}`} onClick={() => setFiltro('pendentes')}>Pendentes</button>
        <button className={`chip ${filtro === 'atrasadas' ? 'active' : ''}`} onClick={() => setFiltro('atrasadas')}>Atrasadas</button>
        <button className={`chip ${filtro === 'pagas' ? 'active' : ''}`} onClick={() => setFiltro('pagas')}>Pagas este mês</button>
        <button className={`chip ${filtro === 'pausadas' ? 'active' : ''}`} onClick={() => setFiltro('pausadas')}>Pausadas</button>
      </div>

      {ordenada.length === 0 && <div className="card"><div className="empty">Nenhuma conta encontrada para esse filtro.</div></div>}

      {ordenada.map(c => (
        <div className="credor-card" key={c.id}>
          <div className="credor-top">
            <div>
              <div className="credor-nome">{c.nome}{c.titular && <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}> · {c.titular}</span>}</div>
              <div className="credor-sub">
                {c.categoria} · {c.tipo_valor === 'variavel' ? 'cartão' : 'valor fixo'} · vence dia {c.dia_vencimento}
                {!c.pago && !c.concluida && ` · ${c.dias === 0 ? 'vence hoje' : c.dias > 0 ? `em ${c.dias} dias` : `${Math.abs(c.dias)} dias atrasada`}`}
              </div>
            </div>
            {!c.ativa
              ? <span className="status-pill quitado">Pausada</span>
              : c.concluida
                ? <span className="status-pill quitado">Concluída</span>
                : c.pago
                  ? <span className="status-pill em_dia">Paga este mês</span>
                  : c.dias < 0
                    ? <span className="status-pill atrasado">Atrasada</span>
                    : <span className="status-pill negociando">Pendente</span>}
          </div>

          {c.tipo_valor === 'fixo' && c.quantidade_parcelas && (
            <div className="credor-progress">
              <div className="track"><div className="fill" style={{ width: Math.min((c.parcelasPagas / c.quantidade_parcelas) * 100, 100) + '%' }}></div></div>
            </div>
          )}

          <div className="credor-nums">
            <div><span className="label">{c.tipo_valor === 'variavel' ? 'Valor deste mês' : 'Valor'}</span><span className="mono">{fmtMoeda(c.valor)}</span></div>
            {c.tipo_valor === 'fixo' && c.quantidade_parcelas && (
              <div><span className="label">Parcelas</span><span className="mono">{c.parcelasPagas}/{c.quantidade_parcelas}</span></div>
            )}
            {c.tipo_valor === 'fixo' && !c.quantidade_parcelas && (
              <div><span className="label">Prazo</span><span className="mono">sem fim</span></div>
            )}
          </div>

          {c.tipo_valor === 'variavel' && c.ativa && !c.pago && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="number" step="0.01" placeholder="ajustar valor deste mês (opcional)"
                value={edicaoValor[c.id] ?? ''}
                onChange={e => setEdicaoValor(prev => ({ ...prev, [c.id]: e.target.value }))}
                style={{ maxWidth: 240 }}
              />
            </div>
          )}

          <div className="credor-actions">
            {c.ativa && !c.pago && (
              <button className="primary" onClick={() => marcarPaga(c)}>Marcar como paga</button>
            )}
            {c.ativa && c.pago && (
              <button onClick={() => desfazerPagamento(c)}>Desfazer pagamento</button>
            )}
            {c.ativa
              ? <button onClick={() => pausarConta(c.id)}>Pausar</button>
              : <button onClick={() => reativarConta(c.id)}>Reativar</button>}
            <button className="danger" onClick={() => removerConta(c.id)}>Excluir</button>
          </div>

          {c.observacoes && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--ink-muted)' }}>{c.observacoes}</div>}
        </div>
      ))}
    </div>
  );
}
