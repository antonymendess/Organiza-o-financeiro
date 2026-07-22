export function fmtMoeda(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ymDe(data) {
  const d = new Date(data + 'T00:00:00');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function labelMes(ym) {
  const [ano, mes] = ym.split('-').map(Number);
  const d = new Date(ano, mes - 1, 1);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function mesesDisponiveis(lancamentos) {
  const hoje = new Date();
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const set = new Set([atual]);
  lancamentos.forEach(l => set.add(ymDe(l.data)));
  return Array.from(set).sort().reverse();
}

export function ultimosMeses(n) {
  const arr = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    let label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    label = label.charAt(0).toUpperCase() + label.slice(1);
    arr.push({ ano: d.getFullYear(), mes: d.getMonth(), label });
  }
  return arr;
}

export function mesesEntre(d1, d2) {
  const anos = d2.getFullYear() - d1.getFullYear();
  const meses = d2.getMonth() - d1.getMonth();
  return anos * 12 + meses + (d2.getDate() >= d1.getDate() ? 0 : -1);
}

export function calcularMetaGoal(lancamentos, config) {
  const hoje = new Date();
  const inicio = new Date(config.data_inicio);
  const fim = new Date(config.data_fim);

  const totalGuardado = lancamentos.filter(l => l.tipo === 'aporte').reduce((s, l) => s + Number(l.valor), 0);
  const meta = Number(config.meta_valor);
  const valorRestante = Math.max(meta - totalGuardado, 0);

  let mesesRestantes = mesesEntre(hoje, fim);
  if (mesesRestantes < 1) mesesRestantes = 1;
  const mesesTotais = Math.max(mesesEntre(inicio, fim), 1);
  const mesesDecorridos = Math.min(Math.max(mesesEntre(inicio, hoje), 1), mesesTotais);
  const ritmoNecessario = valorRestante / mesesRestantes;

  const pctTempo = Math.min((mesesDecorridos / mesesTotais) * 100, 100);
  const pctDinheiro = Math.min((totalGuardado / meta) * 100, 100);
  const diff = pctDinheiro - pctTempo;

  let status = 'ok';
  if (diff < -5) status = 'behind';
  else if (diff > 5) status = 'ahead';

  return {
    totalGuardado, meta, valorRestante, mesesRestantes, mesesTotais, mesesDecorridos,
    ritmoNecessario, pctTempo, pctDinheiro, diff, status
  };
}

export function agruparPorCategoria(lista) {
  const porCategoria = {};
  lista.forEach(l => { porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + Number(l.valor); });
  return Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
}

// ---------------- CRM de cobrança ----------------

export function diasAteVencimento(diaVencimento) {
  const hoje = new Date();
  let venc = new Date(hoje.getFullYear(), hoje.getMonth(), diaVencimento);
  if (venc < hoje) venc = new Date(hoje.getFullYear(), hoje.getMonth() + 1, diaVencimento);
  const diffMs = venc - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function saldoDevedorCredor(c) {
  if (c.tipo_divida === 'rotativo') return Number(c.valor_fatura_atual || 0);
  const restante = Number(c.valor_parcela || 0) * ((c.quantidade_parcelas || 0) - (c.parcelas_pagas || 0));
  return Math.max(restante, 0);
}

export function compromissoMensalCredor(c) {
  if (c.tipo_divida === 'rotativo') return Number(c.valor_fatura_atual || 0);
  return Number(c.valor_parcela || 0);
}

export function calcularKpisCredores(credores) {
  const ativos = credores.filter(c => c.status !== 'quitado');
  const totalDivida = ativos.reduce((s, c) => s + saldoDevedorCredor(c), 0);
  const comprometidoMensal = ativos.reduce((s, c) => s + compromissoMensalCredor(c), 0);
  const atrasados = credores.filter(c => c.status === 'atrasado').length;
  const proximosVencimentos = ativos
    .map(c => ({ nome: c.nome, dias: diasAteVencimento(c.dia_vencimento) }))
    .sort((a, b) => a.dias - b.dias);
  const proximo = proximosVencimentos[0] || null;

  return { totalDivida, comprometidoMensal, atrasados, proximo, ativosCount: ativos.length };
}
