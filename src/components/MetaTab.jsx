import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  fmtMoeda, ymDe, labelMes, mesesDisponiveis, ultimosMeses,
  calcularMetaGoal, agruparPorCategoria, contaAtivaNoCiclo,
  cicloAtual, proximoMes, calcularResumoReserva, valorReservadoNoMes
} from '../utils';
import ContasDashboard from './ContasDashboard';

const CATEGORIAS_DESPESA = ['Moradia', 'Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Assinaturas', 'Cartão', 'Empréstimo', 'Loja', 'Financiamento', 'Outros'];
const ORIGENS_RENDA = ['Renda fixa', 'Comissão', 'Outros'];

function proximosMeses(dataBase, n) {
  const base = new Date(dataBase + 'T00:00:00');
  const arr = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    arr.push(ym);
  }
  return arr;
}

export default function MetaTab({
  userId, config, setConfig, lancamentos, setLancamentos,
  contas, setContas, pagamentos, setPagamentos
}) {
  const [tabForm, setTabForm] = useState('aporte');
  const [pessoa, setPessoa] = useState('eu');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState(CATEGORIAS_DESPESA[0]);
  const [descricao, setDescricao] = useState('');

  const [repetirMes, setRepetirMes] = useState(false);
  const [qtdParcelas, setQtdParcelas] = useState('');
  const [mesInicio, setMesInicio] = useState(ymDe(new Date().toISOString().slice(0, 10)));

  const [settingsAberto, setSettingsAberto] = useState(false);
  const [metaValorInput, setMetaValorInput] = useState(config.meta_valor);
  const [dataFimInput, setDataFimInput] = useState(config.data_fim);
  const [nomeEuInput, setNomeEuInput] = useState(config.nome_eu);
  const [nomeEsposaInput, setNomeEsposaInput] = useState(config.nome_esposa);

  const [filtroPessoa, setFiltroPessoa] = useState('todos');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [mesResumo, setMesResumo] = useState(cicloAtual());

  useEffect(() => {
    setMesInicio(ymDe(data));
  }, [data]);

  function setTab(tipo) {
    setTabForm(tipo);
    setRepetirMes(false);
    setQtdParcelas('');
    if (tipo === 'despesa') setCategoria(CATEGORIAS_DESPESA[0]);
    if (tipo === 'renda') setCategoria(ORIGENS_RENDA[0]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valor || Number(valor) <= 0 || !data) return;
    const cat = tabForm !== 'aporte' ? categoria : null;

    if (tabForm === 'despesa' && repetirMes) {
      const dia = new Date(data + 'T00:00:00').getDate();
      const dataInicio = mesInicio + '-01';
      const { data: novaConta, error } = await supabase.from('contas').insert({
        user_id: userId, nome: descricao || categoria, categoria: cat, pessoa,
        tipo_valor: 'fixo', valor: Number(valor),
        quantidade_parcelas: qtdParcelas ? Number(qtdParcelas) : null,
        dia_vencimento: dia, data_inicio: dataInicio, ativa: true
      }).select().single();
      if (error) { alert('Erro ao cadastrar: ' + error.message); return; }
      setContas(prev => [novaConta, ...prev]);
    } else {
      const { data: novoLt } = await supabase.from('lancamentos').insert({
        user_id: userId, tipo: tabForm, pessoa, valor: Number(valor), data,
        categoria: cat, descricao, origem_conta_id: null
      }).select().single();
      setLancamentos(prev => [novoLt, ...prev]);
    }

    setValor(''); setDescricao(''); setRepetirMes(false); setQtdParcelas('');
  }

  async function removerLancamento(id) {
    await supabase.from('lancamentos').delete().eq('id', id);
    setLancamentos(prev => prev.filter(l => l.id !== id));
  }

  async function salvarSettings(e) {
    e.preventDefault();
    const { data: atualizado } = await supabase.from('configuracoes')
      .update({ meta_valor: Number(metaValorInput), data_fim: dataFimInput, nome_eu: nomeEuInput, nome_esposa: nomeEsposaInput })
      .eq('id', config.id).select().single();
    setConfig(atualizado);
    setSettingsAberto(false);
  }

  function exportarBackup() {
    const payload = { config, lancamentos, contas, pagamentos };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-meta70-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const goal = calcularMetaGoal(lancamentos, config);
  const meses = mesesDisponiveis(lancamentos, contas);
  const categoriasUsadas = Array.from(new Set(lancamentos.filter(l => l.categoria).map(l => l.categoria))).sort();
  const opcoesMesInicio = proximosMeses(data, 12);

  const contasNaoConcluidas = (ym) => contas.filter(c => {
    if (!contaAtivaNoCiclo(c, ym)) return false;
    if (!c.quantidade_parcelas) return true;
    const pagas = pagamentos.filter(p => p.conta_id === c.id).length;
    return pagas < c.quantidade_parcelas;
  });

  const doMes = (tipo, ym) => {
    if (!ym) return [];
    const [ano, mesIdx] = ym.split('-').map(Number);
    return lancamentos.filter(l => {
      if (l.tipo !== tipo) return false;
      if (l.origem_conta_id) return false; // contas entram pela tabela "contas", não duplicam aqui
      const d = new Date(l.data + 'T00:00:00');
      return d.getMonth() === mesIdx - 1 && d.getFullYear() === ano;
    });
  };
  const despesasAvulsasMes = doMes('despesa', mesResumo);
  const receitasMes = doMes('renda', mesResumo);
  const contasDoMesResumo = mesResumo ? contasNaoConcluidas(mesResumo) : [];
  const despesasMes = [...despesasAvulsasMes, ...contasDoMesResumo.map(c => ({ categoria: c.categoria, valor: c.valor }))];
  const totalReceitaMes = receitasMes.reduce((s, l) => s + Number(l.valor), 0);
  const totalDespesaMes = despesasMes.reduce((s, l) => s + Number(l.valor), 0);
  const reservadoNoMesResumo = mesResumo ? valorReservadoNoMes(pagamentos, mesResumo) : 0;
  const saldoMes = totalReceitaMes - totalDespesaMes - reservadoNoMesResumo;

  const totalEu = lancamentos.filter(l => l.tipo === 'aporte' && l.pessoa === 'eu').reduce((s, l) => s + Number(l.valor), 0);
  const totalEsposa = lancamentos.filter(l => l.tipo === 'aporte' && l.pessoa === 'esposa').reduce((s, l) => s + Number(l.valor), 0);
  const maxComparativo = Math.max(totalEu, totalEsposa, 1);

  const meses6 = ultimosMeses(6);
  const fluxoDados = meses6.map(m => {
    const renda = lancamentos.filter(l => l.tipo === 'renda' && !l.origem_conta_id && new Date(l.data + 'T00:00:00').getMonth() === m.mes && new Date(l.data + 'T00:00:00').getFullYear() === m.ano).reduce((s, l) => s + Number(l.valor), 0);
    const despesaAvulsa = lancamentos.filter(l => l.tipo === 'despesa' && !l.origem_conta_id && new Date(l.data + 'T00:00:00').getMonth() === m.mes && new Date(l.data + 'T00:00:00').getFullYear() === m.ano).reduce((s, l) => s + Number(l.valor), 0);
    const despesaContas = contasNaoConcluidas(m.ym).reduce((s, c) => s + Number(c.valor), 0);
    return { ...m, renda, despesa: despesaAvulsa + despesaContas };
  });
  const maxFluxo = Math.max(...fluxoDados.map(d => Math.max(d.renda, d.despesa)), 1);

  const ymAtualReal = cicloAtual();
  const ymProximoReal = proximoMes(ymAtualReal);
  const recebiMesAtual = lancamentos
    .filter(l => l.tipo === 'renda' && ymDe(l.data) === ymAtualReal)
    .reduce((s, l) => s + Number(l.valor), 0);
  const resumoReserva = calcularResumoReserva(contas, pagamentos, ymProximoReal);

  const inicioRange = new Date(meses6[0].ano, meses6[0].mes, 1);
  let acumulado = lancamentos.filter(l => l.tipo === 'aporte' && new Date(l.data + 'T00:00:00') < inicioRange).reduce((s, l) => s + Number(l.valor), 0);
  const evolucaoDados = meses6.map(m => {
    const doMesVal = lancamentos.filter(l => l.tipo === 'aporte' && new Date(l.data + 'T00:00:00').getMonth() === m.mes && new Date(l.data + 'T00:00:00').getFullYear() === m.ano).reduce((s, l) => s + Number(l.valor), 0);
    acumulado += doMesVal;
    return { ...m, acumulado };
  });
  const maxEvolucao = Math.max(...evolucaoDados.map(d => d.acumulado), config.meta_valor * 0.1, 1);

  let listaFiltrada = [...lancamentos].sort((a, b) => new Date(b.data) - new Date(a.data));
  if (filtroPessoa !== 'todos') listaFiltrada = listaFiltrada.filter(l => l.pessoa === filtroPessoa);
  if (filtroMes !== 'todos') listaFiltrada = listaFiltrada.filter(l => ymDe(l.data) === filtroMes);
  if (filtroCategoria !== 'todas') listaFiltrada = listaFiltrada.filter(l => l.categoria === filtroCategoria);

  const tipoLabel = { aporte: 'Aporte', despesa: 'Despesa', renda: 'Renda' };

  return (
    <div>
      {/* --------- Card da meta --------- */}
      <div className="card goal-card">
        <div className="goal-top">
          <div>
            <div className="big mono">{fmtMoeda(goal.totalGuardado)}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 4 }}>
              guardado de <span className="mono">{fmtMoeda(goal.meta)}</span>
            </div>
          </div>
          <div className="goal-meta">
            <div><label>Faltam</label><div className="v mono">{fmtMoeda(goal.valorRestante)}</div></div>
            <div><label>Meses restantes</label><div className="v mono">{goal.mesesRestantes}</div></div>
            <div><label>Ritmo necessário/mês</label><div className="v mono">{fmtMoeda(goal.ritmoNecessario)}</div></div>
          </div>
        </div>

        <div className="rail">
          <div className="rail-label"><span>Tempo decorrido</span><span className="mono">{goal.mesesDecorridos} / {goal.mesesTotais} meses</span></div>
          <div className="rail-track"><div className="rail-fill time" style={{ width: goal.pctTempo + '%' }}></div></div>
        </div>
        <div className="rail">
          <div className="rail-label"><span>Guardado</span><span className="mono">{goal.pctDinheiro.toFixed(0)}%</span></div>
          <div className="rail-track"><div className={`rail-fill money ${goal.status !== 'ok' ? goal.status : ''}`} style={{ width: goal.pctDinheiro + '%' }}></div></div>
        </div>

        <span className={`status-badge ${goal.status}`}>
          {goal.status === 'ok' && 'No ritmo certo'}
          {goal.status === 'behind' && `Atrasado — abaixo do ritmo em ${Math.abs(goal.diff).toFixed(0)} pontos`}
          {goal.status === 'ahead' && `Adiantado — acima do ritmo em ${goal.diff.toFixed(0)} pontos`}
        </span>

        <div>
          <button className="link-btn" style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 600, background: 'var(--surface-alt)', padding: '7px 14px', borderRadius: 20, textDecoration: 'none', color: 'var(--ink)' }}
            onClick={() => setSettingsAberto(!settingsAberto)}>⚙ Ajustar meta, prazo e backup</button>
          {settingsAberto && (
            <div className="settings-panel">
              <form onSubmit={salvarSettings}>
                <div className="row2">
                  <div><label>Valor da meta (R$)</label><input type="number" step="0.01" value={metaValorInput} onChange={e => setMetaValorInput(e.target.value)} /></div>
                  <div><label>Data final</label><input type="date" value={dataFimInput} onChange={e => setDataFimInput(e.target.value)} /></div>
                </div>
                <div className="row2">
                  <div><label>Nome (pessoa 1)</label><input value={nomeEuInput} onChange={e => setNomeEuInput(e.target.value)} /></div>
                  <div><label>Nome (pessoa 2)</label><input value={nomeEsposaInput} onChange={e => setNomeEsposaInput(e.target.value)} /></div>
                </div>
                <button className="btn-primary" type="submit">Salvar</button>
              </form>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 8 }}>
                  Backup dos dados — guarde este arquivo num lugar seguro.
                </div>
                <button type="button" className="btn-secondary" onClick={exportarBackup}>Baixar backup</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid">
        {/* --------- Coluna esquerda: cadastro único --------- */}
        <div>
          <div className="card">
            <div className="tabs">
              <button className={`tab-btn ${tabForm === 'aporte' ? 'active' : ''}`} onClick={() => setTab('aporte')}>+ Aporte</button>
              <button className={`tab-btn ${tabForm === 'despesa' ? 'active' : ''}`} onClick={() => setTab('despesa')}>+ Despesa</button>
              <button className={`tab-btn ${tabForm === 'renda' ? 'active' : ''}`} onClick={() => setTab('renda')}>+ Renda</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="person-toggle">
                <button type="button" className={pessoa === 'eu' ? 'active' : ''} onClick={() => setPessoa('eu')}>{config.nome_eu}</button>
                <button type="button" className={pessoa === 'esposa' ? 'active' : ''} onClick={() => setPessoa('esposa')}>{config.nome_esposa}</button>
              </div>
              <div><label>Valor (R$)</label><input type="number" step="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} required /></div>
              <div className="row2">
                <div><label>Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} required /></div>
                {tabForm !== 'aporte' && (
                  <div>
                    <label>{tabForm === 'despesa' ? 'Categoria' : 'Origem'}</label>
                    <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                      {(tabForm === 'despesa' ? CATEGORIAS_DESPESA : ORIGENS_RENDA).map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div><label>Descrição (opcional)</label><input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="ex: Aluguel, Cartão Nubank" /></div>

              {tabForm === 'despesa' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={repetirMes} onChange={e => setRepetirMes(e.target.checked)} />
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>Repetir todo mês (vira uma conta em "Minhas contas")</span>
                  </label>
                  {repetirMes && (
                    <div style={{ background: 'var(--surface-alt)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label>Quantidade de parcelas (em branco = sem fim, ex: aluguel)</label>
                        <input type="number" min="1" placeholder="ex: 12" value={qtdParcelas} onChange={e => setQtdParcelas(e.target.value)} />
                      </div>
                      <div>
                        <label>Começar a contar a partir de</label>
                        <select value={mesInicio} onChange={e => setMesInicio(e.target.value)}>
                          {opcoesMesInicio.map(ym => <option key={ym} value={ym}>{labelMes(ym)}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}

              <button className="btn-primary" type="submit">
                {tabForm === 'aporte' ? 'Guardar aporte' : tabForm === 'despesa' ? (repetirMes ? 'Cadastrar conta' : 'Lançar despesa') : 'Lançar renda'}
              </button>
            </form>
          </div>

          <div className="card">
            <h2>Quem guardou mais</h2>
            <div className="compare">
              <div className="who">
                <div className="name"><span>{config.nome_eu}</span><span className="mono">{fmtMoeda(totalEu)}</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ width: (totalEu / maxComparativo * 100) + '%' }}></div></div>
              </div>
              <div className="who">
                <div className="name"><span>{config.nome_esposa}</span><span className="mono">{fmtMoeda(totalEsposa)}</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ background: 'var(--gold)', width: (totalEsposa / maxComparativo * 100) + '%' }}></div></div>
              </div>
            </div>
          </div>
        </div>

        {/* --------- Coluna direita: resumo, contas, histórico, lançamentos --------- */}
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>Resumo do mês</h2>
              <select value={mesResumo || ''} onChange={e => setMesResumo(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, background: 'var(--bg)' }}>
                {meses.map(ym => <option key={ym} value={ym}>{labelMes(ym)}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid var(--border)' }}>
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Receita</label><div className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--teal)' }}>{fmtMoeda(totalReceitaMes)}</div></div>
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Despesa</label><div className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--brick)' }}>{fmtMoeda(totalDespesaMes)}</div></div>
              {reservadoNoMesResumo > 0 && (
                <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Reservado p/ próx. mês</label><div className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--gold)' }}>{fmtMoeda(reservadoNoMesResumo)}</div></div>
              )}
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Saldo livre do mês</label><div className="mono" style={{ fontSize: 17, fontWeight: 600, color: saldoMes < 0 ? 'var(--brick)' : 'var(--teal)' }}>{fmtMoeda(saldoMes)}</div></div>
            </div>
            <div className="resumo-grid">
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 12 }}>Despesas por categoria</div>
                <BarrasCategoria lista={despesasMes} vazio="Nenhuma despesa neste mês." />
              </div>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 12 }}>Receitas por origem</div>
                <BarrasCategoria lista={receitasMes} vazio="Nenhuma receita neste mês." />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 4 }}>Depois do pagamento</h2>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 16 }}>Reserva para {labelMes(ymProximoReal)}</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Recebi este mês</label><div className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{fmtMoeda(recebiMesAtual)}</div></div>
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Preciso reservar</label><div className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{fmtMoeda(resumoReserva.total)}</div></div>
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Já reservei</label><div className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--teal)' }}>{fmtMoeda(resumoReserva.jaReservado)}</div></div>
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Falta reservar</label><div className="mono" style={{ fontSize: 17, fontWeight: 600, color: resumoReserva.faltaReservar > 0 ? 'var(--brick)' : 'var(--teal)' }}>{fmtMoeda(resumoReserva.faltaReservar)}</div></div>
            </div>
          </div>

          <ContasDashboard
            userId={userId} config={config}
            contas={contas} setContas={setContas}
            pagamentos={pagamentos} setPagamentos={setPagamentos}
            ym={mesResumo}
            onContaPaga={(novoLt) => setLancamentos(prev => [novoLt, ...prev])}
          />

          <div className="card">
            <h2>Histórico (últimos 6 meses)</h2>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10 }}>Receita x despesa por mês</div>
              {fluxoDados.every(d => d.renda === 0 && d.despesa === 0)
                ? <div className="empty">Nenhuma receita ou despesa lançada ainda.</div>
                : <FluxoChart dados={fluxoDados} max={maxFluxo} />}
            </div>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10 }}>Evolução do saldo guardado</div>
              {goal.totalGuardado === 0
                ? <div className="empty">Nenhum aporte guardado ainda.</div>
                : <EvolucaoChart dados={evolucaoDados} max={maxEvolucao} />}
            </div>
          </div>

          <div className="card">
            <h2>Lançamentos</h2>
            <div className="filters">
              <button className={`chip ${filtroPessoa === 'todos' ? 'active' : ''}`} onClick={() => setFiltroPessoa('todos')}>Todos</button>
              <button className={`chip ${filtroPessoa === 'eu' ? 'active' : ''}`} onClick={() => setFiltroPessoa('eu')}>{config.nome_eu}</button>
              <button className={`chip ${filtroPessoa === 'esposa' ? 'active' : ''}`} onClick={() => setFiltroPessoa('esposa')}>{config.nome_esposa}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={{ flex: 1, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)' }}>
                <option value="todos">Todos os meses</option>
                {meses.map(ym => <option key={ym} value={ym}>{labelMes(ym)}</option>)}
              </select>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ flex: 1, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)' }}>
                <option value="todas">Todas categorias</option>
                {categoriasUsadas.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Data</th><th>Quem</th><th>Tipo</th><th>Descrição</th><th style={{ textAlign: 'right' }}>Valor</th><th></th></tr></thead>
                <tbody>
                  {listaFiltrada.length === 0 && <tr><td colSpan={6}><div className="empty">Nenhum lançamento encontrado para esse filtro.</div></td></tr>}
                  {listaFiltrada.map(l => (
                    <tr key={l.id}>
                      <td className="mono">{new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      <td><span className={`tag ${l.pessoa}`}>{l.pessoa === 'eu' ? config.nome_eu : config.nome_esposa}</span></td>
                      <td>
                        <span className={`tag ${l.tipo}`}>{tipoLabel[l.tipo]}{l.categoria ? ' · ' + l.categoria : ''}</span>
                        {l.origem_conta_id && <span className="tag fixa" style={{ marginLeft: 4 }}>conta</span>}
                      </td>
                      <td>{l.descricao || '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtMoeda(l.valor)}</td>
                      <td><button className="del-btn" onClick={() => removerLancamento(l.id)}>remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BarrasCategoria({ lista, vazio }) {
  const entradas = agruparPorCategoria(lista);
  if (entradas.length === 0) return <div className="empty">{vazio}</div>;
  const max = entradas[0][1];
  return entradas.map(([cat, val]) => (
    <div className="cat-row" key={cat}>
      <div className="label">{cat}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: (val / max * 100) + '%' }}></div></div>
      <div className="val mono">{fmtMoeda(val)}</div>
    </div>
  ));
}

function FluxoChart({ dados, max }) {
  const w = 560, h = 190, padL = 8, padB = 26, padT = 10;
  const groupW = (w - padL * 2) / dados.length;
  const gap = 6;
  const barW = (groupW - gap * 3) / 2;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {dados.map((d, i) => {
          const x = padL + i * groupW + gap;
          const areaH = h - padB - padT;
          const hRenda = (d.renda / max) * areaH;
          const hDespesa = (d.despesa / max) * areaH;
          return (
            <g key={i}>
              <rect x={x} y={h - padB - hRenda} width={barW} height={hRenda} rx={3} fill="var(--teal)" />
              <rect x={x + barW + gap} y={h - padB - hDespesa} width={barW} height={hDespesa} rx={3} fill="var(--brick)" />
              <text x={x + barW + gap / 2} y={h - 8} fontSize={10} fill="var(--ink-muted)" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-muted)', marginTop: 8 }}>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--teal)', marginRight: 5 }}></span>Receita</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--brick)', marginRight: 5 }}></span>Despesa</span>
      </div>
    </div>
  );
}

function EvolucaoChart({ dados, max }) {
  const w = 560, h = 190, padX = 10, padB = 26, padT = 14;
  const stepX = (w - padX * 2) / (dados.length - 1 || 1);
  const points = dados.map((d, i) => ({
    x: padX + i * stepX,
    y: padT + (1 - (d.acumulado / max)) * (h - padT - padB),
    label: d.label
  }));
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const areaD = pathD + ` L${points[points.length - 1].x.toFixed(1)},${h - padB} L${points[0].x.toFixed(1)},${h - padB} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <path d={areaD} fill="var(--teal-soft)" stroke="none" />
      <path d={pathD} fill="none" stroke="var(--teal)" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--teal)" />)}
      {points.map((p, i) => <text key={i} x={p.x} y={h - 8} fontSize={10} textAnchor="middle" fill="var(--ink-muted)">{p.label}</text>)}
    </svg>
  );
}
