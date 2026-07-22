import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  fmtMoeda, ymDe, labelMes, mesesDisponiveis, ultimosMeses,
  calcularMetaGoal, agruparPorCategoria
} from '../utils';

const CATEGORIAS_DESPESA = ['Moradia', 'Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Assinaturas', 'Outros'];
const ORIGENS_RENDA = ['Renda fixa', 'Comissão', 'Outros'];

export default function MetaTab({ userId }) {
  const [config, setConfig] = useState(null);
  const [lancamentos, setLancamentos] = useState([]);
  const [recorrentes, setRecorrentes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [tabForm, setTabForm] = useState('aporte');
  const [pessoa, setPessoa] = useState('eu');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState(CATEGORIAS_DESPESA[0]);
  const [descricao, setDescricao] = useState('');
  const [ehFixa, setEhFixa] = useState(false);

  const [settingsAberto, setSettingsAberto] = useState(false);
  const [metaValorInput, setMetaValorInput] = useState(70000);
  const [dataFimInput, setDataFimInput] = useState('');
  const [nomeEuInput, setNomeEuInput] = useState('Eu');
  const [nomeEsposaInput, setNomeEsposaInput] = useState('Esposa');

  const [filtroPessoa, setFiltroPessoa] = useState('todos');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [mesResumo, setMesResumo] = useState(null);

  useEffect(() => { carregarTudo(); }, []);

  async function carregarTudo() {
    setCarregando(true);
    let { data: configs } = await supabase.from('configuracoes').select('*').eq('user_id', userId).limit(1);
    let cfg;
    if (configs && configs.length) {
      cfg = configs[0];
    } else {
      const dataFim = new Date();
      dataFim.setFullYear(dataFim.getFullYear() + 2);
      const { data: novo } = await supabase.from('configuracoes')
        .insert({ user_id: userId, data_fim: dataFim.toISOString().slice(0, 10) })
        .select().single();
      cfg = novo;
    }
    setConfig(cfg);
    setMetaValorInput(cfg.meta_valor);
    setDataFimInput(cfg.data_fim);
    setNomeEuInput(cfg.nome_eu);
    setNomeEsposaInput(cfg.nome_esposa);

    const { data: lts } = await supabase.from('lancamentos').select('*').eq('user_id', userId).order('data', { ascending: false });
    const { data: recs } = await supabase.from('recorrentes').select('*').eq('user_id', userId);

    await gerarRecorrentesFaltantes(recs || [], lts || []);
    setRecorrentes(recs || []);

    const { data: ltsFinal } = await supabase.from('lancamentos').select('*').eq('user_id', userId).order('data', { ascending: false });
    setLancamentos(ltsFinal || []);
    setMesResumo(mesesDisponiveis(ltsFinal || [])[0]);
    setCarregando(false);
  }

  async function gerarRecorrentesFaltantes(recs, lts) {
    const hoje = new Date();
    const mes = hoje.getMonth(), ano = hoje.getFullYear();
    const paraInserir = [];
    recs.forEach(r => {
      const existe = lts.some(l => l.origem_recorrente_id === r.id &&
        new Date(l.data + 'T00:00:00').getMonth() === mes &&
        new Date(l.data + 'T00:00:00').getFullYear() === ano);
      if (!existe) {
        const ultimoDia = new Date(ano, mes + 1, 0).getDate();
        const dia = Math.min(r.dia_vencimento, ultimoDia);
        const dataStr = new Date(ano, mes, dia).toISOString().slice(0, 10);
        paraInserir.push({
          user_id: userId, tipo: r.tipo, pessoa: r.pessoa, valor: r.valor,
          categoria: r.categoria, descricao: r.descricao, data: dataStr,
          origem_recorrente_id: r.id, recorrente: true
        });
      }
    });
    if (paraInserir.length) {
      await supabase.from('lancamentos').insert(paraInserir);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valor || Number(valor) <= 0 || !data) return;
    const cat = tabForm !== 'aporte' ? categoria : null;

    let origemId = null;
    if (ehFixa && tabForm !== 'aporte') {
      const dia = new Date(data + 'T00:00:00').getDate();
      const { data: novoRec } = await supabase.from('recorrentes').insert({
        user_id: userId, tipo: tabForm, pessoa, valor: Number(valor),
        categoria: cat, descricao, dia_vencimento: dia
      }).select().single();
      origemId = novoRec.id;
      setRecorrentes(prev => [...prev, novoRec]);
    }

    const { data: novoLt } = await supabase.from('lancamentos').insert({
      user_id: userId, tipo: tabForm, pessoa, valor: Number(valor), data,
      categoria: cat, descricao, origem_recorrente_id: origemId, recorrente: !!(ehFixa && tabForm !== 'aporte')
    }).select().single();

    setLancamentos(prev => [novoLt, ...prev]);
    setValor(''); setDescricao(''); setEhFixa(false);
  }

  async function removerLancamento(id) {
    await supabase.from('lancamentos').delete().eq('id', id);
    setLancamentos(prev => prev.filter(l => l.id !== id));
  }

  async function removerRecorrente(id) {
    await supabase.from('recorrentes').delete().eq('id', id);
    setRecorrentes(prev => prev.filter(r => r.id !== id));
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
    const payload = { config, lancamentos, recorrentes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-meta70-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (carregando || !config) return <div className="empty">Carregando seus dados...</div>;

  const goal = calcularMetaGoal(lancamentos, config);
  const meses = mesesDisponiveis(lancamentos);
  const categoriasUsadas = Array.from(new Set(lancamentos.filter(l => l.categoria).map(l => l.categoria))).sort();

  const doMes = (tipo, ym) => {
    if (!ym) return [];
    const [ano, mesIdx] = ym.split('-').map(Number);
    return lancamentos.filter(l => {
      if (l.tipo !== tipo) return false;
      const d = new Date(l.data + 'T00:00:00');
      return d.getMonth() === mesIdx - 1 && d.getFullYear() === ano;
    });
  };
  const despesasMes = doMes('despesa', mesResumo);
  const receitasMes = doMes('renda', mesResumo);
  const totalReceitaMes = receitasMes.reduce((s, l) => s + Number(l.valor), 0);
  const totalDespesaMes = despesasMes.reduce((s, l) => s + Number(l.valor), 0);
  const saldoMes = totalReceitaMes - totalDespesaMes;

  const totalEu = lancamentos.filter(l => l.tipo === 'aporte' && l.pessoa === 'eu').reduce((s, l) => s + Number(l.valor), 0);
  const totalEsposa = lancamentos.filter(l => l.tipo === 'aporte' && l.pessoa === 'esposa').reduce((s, l) => s + Number(l.valor), 0);
  const maxComparativo = Math.max(totalEu, totalEsposa, 1);

  const meses6 = ultimosMeses(6);
  const fluxoDados = meses6.map(m => {
    const renda = lancamentos.filter(l => l.tipo === 'renda' && new Date(l.data + 'T00:00:00').getMonth() === m.mes && new Date(l.data + 'T00:00:00').getFullYear() === m.ano).reduce((s, l) => s + Number(l.valor), 0);
    const despesa = lancamentos.filter(l => l.tipo === 'despesa' && new Date(l.data + 'T00:00:00').getMonth() === m.mes && new Date(l.data + 'T00:00:00').getFullYear() === m.ano).reduce((s, l) => s + Number(l.valor), 0);
    return { ...m, renda, despesa };
  });
  const maxFluxo = Math.max(...fluxoDados.map(d => Math.max(d.renda, d.despesa)), 1);

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
        {/* --------- Coluna esquerda: formulário --------- */}
        <div>
          <div className="card">
            <div className="tabs">
              <button className={`tab-btn ${tabForm === 'aporte' ? 'active' : ''}`} onClick={() => setTabForm('aporte')}>+ Aporte</button>
              <button className={`tab-btn ${tabForm === 'despesa' ? 'active' : ''}`} onClick={() => { setTabForm('despesa'); setCategoria(CATEGORIAS_DESPESA[0]); }}>+ Despesa</button>
              <button className={`tab-btn ${tabForm === 'renda' ? 'active' : ''}`} onClick={() => { setTabForm('renda'); setCategoria(ORIGENS_RENDA[0]); }}>+ Renda</button>
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
              <div><label>Descrição (opcional)</label><input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="ex: conserto do carro" /></div>
              {tabForm !== 'aporte' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={ehFixa} onChange={e => setEhFixa(e.target.checked)} />
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>Conta fixa — repetir todo mês automaticamente</span>
                </label>
              )}
              <button className="btn-primary" type="submit">
                {tabForm === 'aporte' ? 'Guardar aporte' : tabForm === 'despesa' ? 'Lançar despesa' : 'Lançar renda'}
              </button>
            </form>
          </div>

          {recorrentes.length > 0 && (
            <div className="card">
              <h2>Contas fixas cadastradas</h2>
              {recorrentes.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.descricao || tipoLabel[r.tipo]}</div>
                    <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                      {tipoLabel[r.tipo]}{r.categoria ? ' · ' + r.categoria : ''} · dia {r.dia_vencimento} · {r.pessoa === 'eu' ? config.nome_eu : config.nome_esposa}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="mono">{fmtMoeda(r.valor)}</span>
                    <button className="del-btn" onClick={() => removerRecorrente(r.id)}>parar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

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

        {/* --------- Coluna direita: resumo, histórico, lançamentos --------- */}
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
              <div><label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Saldo do mês</label><div className="mono" style={{ fontSize: 17, fontWeight: 600, color: saldoMes < 0 ? 'var(--brick)' : 'var(--teal)' }}>{fmtMoeda(saldoMes)}</div></div>
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
                        {l.recorrente && <span className="tag fixa" style={{ marginLeft: 4 }}>fixa</span>}
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
