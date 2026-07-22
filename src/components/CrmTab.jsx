import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fmtMoeda, diasAteVencimento, calcularKpisCredores, saldoDevedorCredor, compromissoMensalCredor } from '../utils';

const CATEGORIAS_CREDOR = ['Cartão', 'Empréstimo', 'Loja', 'Financiamento', 'Outros'];
const STATUS_LABEL = { em_dia: 'Em dia', atrasado: 'Atrasado', negociando: 'Negociando', quitado: 'Quitado' };

function anoMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CrmTab({ userId }) {
  const [credores, setCredores] = useState([]);
  const [negociacoes, setNegociacoes] = useState([]);
  const [faturas, setFaturas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [expandido, setExpandido] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const vazio = {
    nome: '', titular: '', categoria: CATEGORIAS_CREDOR[0], tipo_divida: 'parcelado',
    valor_total: '', valor_parcela: '', quantidade_parcelas: 1,
    limite: '', valor_fatura_atual: '',
    dia_vencimento: 5, taxa_juros: '', contato: '', observacoes: ''
  };
  const [form, setForm] = useState(vazio);

  const [notaTexto, setNotaTexto] = useState('');
  const [notaProximoContato, setNotaProximoContato] = useState('');
  const [edicaoFatura, setEdicaoFatura] = useState({}); // { [credorId]: valorDigitado }

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    const { data: creds } = await supabase.from('credores').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    const { data: negs } = await supabase.from('historico_negociacao').select('*').eq('user_id', userId).order('data', { ascending: false });
    const { data: fats } = await supabase.from('faturas_cartao').select('*').eq('user_id', userId).order('ano_mes', { ascending: false });
    setCredores(creds || []);
    setNegociacoes(negs || []);
    setFaturas(fats || []);
    setCarregando(false);
  }

  async function handleAddCredor(e) {
    e.preventDefault();
    const base = {
      user_id: userId,
      nome: form.nome,
      titular: form.titular || null,
      categoria: form.categoria,
      tipo_divida: form.tipo_divida,
      dia_vencimento: Number(form.dia_vencimento),
      taxa_juros: form.taxa_juros ? Number(form.taxa_juros) : 0,
      contato: form.contato,
      observacoes: form.observacoes,
      status: 'em_dia'
    };
    const payload = form.tipo_divida === 'parcelado'
      ? {
          ...base,
          valor_total: Number(form.valor_total),
          valor_parcela: Number(form.valor_parcela),
          quantidade_parcelas: Number(form.quantidade_parcelas),
          parcelas_pagas: 0
        }
      : {
          ...base,
          limite: form.limite ? Number(form.limite) : null,
          valor_fatura_atual: form.valor_fatura_atual ? Number(form.valor_fatura_atual) : 0
        };

    const { data: novo, error } = await supabase.from('credores').insert(payload).select().single();
    if (error) { alert('Erro ao cadastrar: ' + error.message); return; }
    setCredores(prev => [novo, ...prev]);
    setForm(vazio);
    setFormAberto(false);
  }

  async function marcarParcelaPaga(credor) {
    const novasParcelasPagas = credor.parcelas_pagas + 1;
    const novoStatus = novasParcelasPagas >= credor.quantidade_parcelas ? 'quitado' : (credor.status === 'atrasado' ? 'em_dia' : credor.status);
    await supabase.from('pagamentos_divida').insert({
      user_id: userId, credor_id: credor.id, valor: credor.valor_parcela, parcela_numero: novasParcelasPagas
    });
    const { data: atualizado } = await supabase.from('credores')
      .update({ parcelas_pagas: novasParcelasPagas, status: novoStatus })
      .eq('id', credor.id).select().single();
    setCredores(prev => prev.map(c => c.id === credor.id ? atualizado : c));
  }

  async function atualizarFatura(credor) {
    const novoValor = edicaoFatura[credor.id];
    if (novoValor === undefined || novoValor === '') return;
    const { data: atualizado } = await supabase.from('credores')
      .update({ valor_fatura_atual: Number(novoValor) })
      .eq('id', credor.id).select().single();
    setCredores(prev => prev.map(c => c.id === credor.id ? atualizado : c));
    setEdicaoFatura(prev => ({ ...prev, [credor.id]: undefined }));
  }

  async function marcarFaturaPaga(credor) {
    const anoMes = anoMesAtual();
    const { data: novaFatura } = await supabase.from('faturas_cartao').insert({
      user_id: userId, credor_id: credor.id, ano_mes: anoMes,
      valor: credor.valor_fatura_atual, paga: true, data_pagamento: new Date().toISOString().slice(0, 10)
    }).select().single();
    setFaturas(prev => [novaFatura, ...prev]);
    const { data: atualizado } = await supabase.from('credores')
      .update({ valor_fatura_atual: 0, status: credor.status === 'atrasado' ? 'em_dia' : credor.status })
      .eq('id', credor.id).select().single();
    setCredores(prev => prev.map(c => c.id === credor.id ? atualizado : c));
  }

  async function mudarStatus(credor, novoStatus) {
    const { data: atualizado } = await supabase.from('credores').update({ status: novoStatus }).eq('id', credor.id).select().single();
    setCredores(prev => prev.map(c => c.id === credor.id ? atualizado : c));
  }

  async function removerCredor(id) {
    if (!confirm('Remover este credor e todo o histórico dele? Essa ação não pode ser desfeita.')) return;
    await supabase.from('credores').delete().eq('id', id);
    setCredores(prev => prev.filter(c => c.id !== id));
  }

  async function adicionarNegociacao(credorId) {
    if (!notaTexto.trim()) return;
    const { data: nova } = await supabase.from('historico_negociacao').insert({
      user_id: userId, credor_id: credorId, descricao: notaTexto,
      proximo_contato: notaProximoContato || null
    }).select().single();
    setNegociacoes(prev => [nova, ...prev]);
    setNotaTexto(''); setNotaProximoContato('');
  }

  if (carregando) return <div className="empty">Carregando suas dívidas...</div>;

  const kpis = calcularKpisCredores(credores);
  const listaFiltrada = filtroStatus === 'todos' ? credores : credores.filter(c => c.status === filtroStatus);
  const ordenada = [...listaFiltrada].sort((a, b) => {
    if (a.status === 'quitado' && b.status !== 'quitado') return 1;
    if (b.status === 'quitado' && a.status !== 'quitado') return -1;
    return diasAteVencimento(a.dia_vencimento) - diasAteVencimento(b.dia_vencimento);
  });

  return (
    <div>
      <div className="crm-kpis">
        <div className="kpi-card">
          <label>Dívida ativa total</label>
          <div className="v mono">{fmtMoeda(kpis.totalDivida)}</div>
        </div>
        <div className="kpi-card">
          <label>Comprometido por mês</label>
          <div className="v mono">{fmtMoeda(kpis.comprometidoMensal)}</div>
        </div>
        <div className={`kpi-card ${kpis.atrasados > 0 ? 'alert' : ''}`}>
          <label>Dívidas atrasadas</label>
          <div className="v mono">{kpis.atrasados}</div>
        </div>
        <div className="kpi-card">
          <label>Próximo vencimento</label>
          <div className="v mono" style={{ fontSize: 15 }}>
            {kpis.proximo ? `${kpis.proximo.nome} · ${kpis.proximo.dias === 0 ? 'hoje' : kpis.proximo.dias + 'd'}` : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formAberto ? 16 : 0 }}>
          <h2 style={{ margin: 0 }}>Credores</h2>
          <button className="btn-secondary" onClick={() => setFormAberto(!formAberto)}>
            {formAberto ? 'Cancelar' : '+ Novo credor'}
          </button>
        </div>

        {formAberto && (
          <form onSubmit={handleAddCredor} style={{ marginTop: 6 }}>
            <div className="row2">
              <div>
                <label>Tipo de dívida</label>
                <select value={form.tipo_divida} onChange={e => setForm({ ...form, tipo_divida: e.target.value })}>
                  <option value="parcelado">Parcelado (valor fixo)</option>
                  <option value="rotativo">Cartão de crédito (fatura variável)</option>
                </select>
              </div>
              <div>
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                  {CATEGORIAS_CREDOR.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="row2">
              <div><label>Nome da dívida</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="ex: Cartão Nubank" required /></div>
              <div><label>De quem é (opcional)</label><input value={form.titular} onChange={e => setForm({ ...form, titular: e.target.value })} placeholder="ex: Mãe, Meu nome" /></div>
            </div>

            {form.tipo_divida === 'parcelado' ? (
              <div className="row3">
                <div><label>Valor total da dívida (R$)</label><input type="number" step="0.01" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} required /></div>
                <div><label>Valor da parcela (R$)</label><input type="number" step="0.01" value={form.valor_parcela} onChange={e => setForm({ ...form, valor_parcela: e.target.value })} required /></div>
                <div><label>Nº de parcelas</label><input type="number" min="1" value={form.quantidade_parcelas} onChange={e => setForm({ ...form, quantidade_parcelas: e.target.value })} required /></div>
              </div>
            ) : (
              <div className="row2">
                <div><label>Fatura atual (R$)</label><input type="number" step="0.01" value={form.valor_fatura_atual} onChange={e => setForm({ ...form, valor_fatura_atual: e.target.value })} placeholder="0,00" /></div>
                <div><label>Limite do cartão (opcional)</label><input type="number" step="0.01" value={form.limite} onChange={e => setForm({ ...form, limite: e.target.value })} /></div>
              </div>
            )}

            <div className="row3">
              <div><label>Dia do vencimento</label><input type="number" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm({ ...form, dia_vencimento: e.target.value })} required /></div>
              <div><label>Taxa de juros % (opcional)</label><input type="number" step="0.01" value={form.taxa_juros} onChange={e => setForm({ ...form, taxa_juros: e.target.value })} /></div>
              <div><label>Contato (opcional)</label><input value={form.contato} onChange={e => setForm({ ...form, contato: e.target.value })} placeholder="telefone/e-mail" /></div>
            </div>
            <div><label>Observações</label><textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })}></textarea></div>
            <button className="btn-primary" type="submit">Cadastrar credor</button>
          </form>
        )}
      </div>

      <div className="filters">
        <button className={`chip ${filtroStatus === 'todos' ? 'active' : ''}`} onClick={() => setFiltroStatus('todos')}>Todos</button>
        <button className={`chip ${filtroStatus === 'atrasado' ? 'active' : ''}`} onClick={() => setFiltroStatus('atrasado')}>Atrasados</button>
        <button className={`chip ${filtroStatus === 'em_dia' ? 'active' : ''}`} onClick={() => setFiltroStatus('em_dia')}>Em dia</button>
        <button className={`chip ${filtroStatus === 'negociando' ? 'active' : ''}`} onClick={() => setFiltroStatus('negociando')}>Negociando</button>
        <button className={`chip ${filtroStatus === 'quitado' ? 'active' : ''}`} onClick={() => setFiltroStatus('quitado')}>Quitados</button>
      </div>

      {ordenada.length === 0 && <div className="card"><div className="empty">Nenhum credor cadastrado ainda.</div></div>}

      {ordenada.map(c => {
        const dias = diasAteVencimento(c.dia_vencimento);
        const ehRotativo = c.tipo_divida === 'rotativo';
        const pct = ehRotativo ? null : Math.min((c.parcelas_pagas / c.quantidade_parcelas) * 100, 100);
        const saldo = saldoDevedorCredor(c);
        const notasDoCredor = negociacoes.filter(n => n.credor_id === c.id);
        const faturasDoCredor = faturas.filter(f => f.credor_id === c.id);

        return (
          <div className="credor-card" key={c.id}>
            <div className="credor-top">
              <div>
                <div className="credor-nome">{c.nome}{c.titular && <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}> · {c.titular}</span>}</div>
                <div className="credor-sub">
                  {c.categoria}{ehRotativo ? ' · cartão' : ' · parcelado'} · vence dia {c.dia_vencimento}
                  {c.status !== 'quitado' && ` · ${dias === 0 ? 'vence hoje' : dias > 0 ? `em ${dias} dias` : `${Math.abs(dias)} dias atrasado`}`}
                </div>
              </div>
              <span className={`status-pill ${c.status}`}>{STATUS_LABEL[c.status]}</span>
            </div>

            {!ehRotativo && (
              <div className="credor-progress">
                <div className="track"><div className="fill" style={{ width: pct + '%' }}></div></div>
              </div>
            )}

            <div className="credor-nums">
              {ehRotativo ? (
                <>
                  <div><span className="label">Fatura atual</span><span className="mono">{fmtMoeda(c.valor_fatura_atual)}</span></div>
                  {c.limite && <div><span className="label">Limite</span><span className="mono">{fmtMoeda(c.limite)}</span></div>}
                </>
              ) : (
                <>
                  <div><span className="label">Parcela</span><span className="mono">{fmtMoeda(c.valor_parcela)}</span></div>
                  <div><span className="label">Pagas</span><span className="mono">{c.parcelas_pagas}/{c.quantidade_parcelas}</span></div>
                  <div><span className="label">Restante</span><span className="mono">{fmtMoeda(saldo)}</span></div>
                  {c.taxa_juros > 0 && <div><span className="label">Juros</span><span className="mono">{c.taxa_juros}%</span></div>}
                </>
              )}
            </div>

            {ehRotativo && c.status !== 'quitado' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <input
                  type="number" step="0.01" placeholder="atualizar valor da fatura"
                  value={edicaoFatura[c.id] ?? ''}
                  onChange={e => setEdicaoFatura(prev => ({ ...prev, [c.id]: e.target.value }))}
                  style={{ maxWidth: 200 }}
                />
                <button className="btn-secondary" type="button" onClick={() => atualizarFatura(c)}>Atualizar fatura</button>
              </div>
            )}

            <div className="credor-actions">
              {!ehRotativo && c.status !== 'quitado' && (
                <button className="primary" onClick={() => marcarParcelaPaga(c)}>Marcar parcela paga</button>
              )}
              {ehRotativo && c.status !== 'quitado' && (
                <button className="primary" onClick={() => marcarFaturaPaga(c)}>Marcar fatura como paga</button>
              )}
              {c.status !== 'atrasado' && c.status !== 'quitado' && (
                <button onClick={() => mudarStatus(c, 'atrasado')}>Marcar atrasado</button>
              )}
              {c.status !== 'negociando' && c.status !== 'quitado' && (
                <button onClick={() => mudarStatus(c, 'negociando')}>Em negociação</button>
              )}
              {(c.status === 'atrasado' || c.status === 'negociando') && (
                <button onClick={() => mudarStatus(c, 'em_dia')}>Voltar pra "Em dia"</button>
              )}
              <button onClick={() => setExpandido(expandido === c.id ? null : c.id)}>
                {expandido === c.id ? 'Fechar histórico' : 'Ver histórico'}
              </button>
              <button className="danger" onClick={() => removerCredor(c.id)}>Excluir</button>
            </div>

            {expandido === c.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                {c.observacoes && <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--ink-muted)' }}>{c.observacoes}</div>}
                {c.contato && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 12 }}>Contato: {c.contato}</div>}

                {ehRotativo && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 8 }}>Histórico de faturas</div>
                    {faturasDoCredor.length === 0 && <div className="empty">Nenhuma fatura fechada ainda.</div>}
                    {faturasDoCredor.map(f => (
                      <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{f.ano_mes}</span>
                        <span className="mono">{fmtMoeda(f.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 8 }}>Negociação</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <input placeholder="Nova anotação de negociação..." value={notaTexto} onChange={e => setNotaTexto(e.target.value)} style={{ flex: 2, minWidth: 160 }} />
                  <input type="date" value={notaProximoContato} onChange={e => setNotaProximoContato(e.target.value)} style={{ flex: 1, minWidth: 140 }} title="Próximo contato (opcional)" />
                  <button className="btn-secondary" type="button" onClick={() => adicionarNegociacao(c.id)}>Adicionar</button>
                </div>

                {notasDoCredor.length === 0 && <div className="empty">Nenhuma anotação ainda.</div>}
                {notasDoCredor.map(n => (
                  <div className="negociacao-item" key={n.id}>
                    <div className="data">{new Date(n.data + 'T00:00:00').toLocaleDateString('pt-BR')}{n.proximo_contato && ` · próximo contato: ${new Date(n.proximo_contato + 'T00:00:00').toLocaleDateString('pt-BR')}`}</div>
                    <div>{n.descricao}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
