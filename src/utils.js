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

export function mesesDisponiveis(lancamentos, contas = []) {
  const hoje = new Date();
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const set = new Set([atual]);
  lancamentos.forEach(l => set.add(ymDe(l.data)));
  contas.forEach(c => set.add(ymDe(c.data_inicio)));
  return Array.from(set).sort().reverse();
}

export function ultimosMeses(n) {
  const arr = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    let label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    label = label.charAt(0).toUpperCase() + label.slice(1);
    arr.push({ ano: d.getFullYear(), mes: d.getMonth(), label, ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
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

// ---------------- Contas (unificado, sempre referente a um ciclo/mês) ----------------

export function cicloAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// A conta já começou a valer neste ciclo? (respeita "começar a contar a partir de")
export function contaAtivaNoCiclo(conta, ym) {
  return conta.ativa && ymDe(conta.data_inicio) <= ym;
}

export function foiPagaNoCiclo(contaId, pagamentos, ym) {
  return pagamentos.some(p => p.conta_id === contaId && p.ciclo === ym);
}

export function totalParcelasPagas(contaId, pagamentos) {
  return pagamentos.filter(p => p.conta_id === contaId).length;
}

// Dias até o vencimento dentro do mês/ciclo REAL atual. Só faz sentido
// quando o ciclo sendo visto é o mês corrente de verdade.
export function diasParaVencimento(diaVencimento) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(hoje.getFullYear(), hoje.getMonth(), diaVencimento);
  return Math.round((venc - hoje) / (1000 * 60 * 60 * 24));
}

// Status de uma conta num ciclo específico (pode ser passado, atual ou futuro)
export function statusContaNoCiclo(conta, pagamentos, ym) {
  const pago = foiPagaNoCiclo(conta.id, pagamentos, ym);
  const ymAtual = cicloAtual();
  const parcelasPagas = totalParcelasPagas(conta.id, pagamentos);
  const concluida = conta.quantidade_parcelas && parcelasPagas >= conta.quantidade_parcelas;

  let situacao, dias = null;
  if (concluida) {
    situacao = 'concluida';
  } else if (pago) {
    situacao = 'paga';
  } else if (ym > ymAtual) {
    situacao = 'agendada';
  } else if (ym < ymAtual) {
    situacao = 'nao_paga_no_mes';
  } else {
    dias = diasParaVencimento(conta.dia_vencimento);
    situacao = dias < 0 ? 'atrasada' : 'pendente';
  }
  return { pago, dias, situacao, parcelasPagas, concluida };
}

export function calcularKpisContas(contas, pagamentos, ym) {
  const doMes = contas.filter(c => contaAtivaNoCiclo(c, ym));
  let totalMes = 0, jaPago = 0, atrasadas = 0;
  const pendentes = [];

  doMes.forEach(c => {
    const st = statusContaNoCiclo(c, pagamentos, ym);
    if (st.concluida) return;
    totalMes += Number(c.valor);
    if (st.pago) {
      jaPago += Number(c.valor);
    } else {
      if (st.situacao === 'atrasada') atrasadas++;
      pendentes.push({ nome: c.nome, dias: st.dias ?? 0 });
    }
  });

  pendentes.sort((a, b) => a.dias - b.dias);
  return { totalMes, jaPago, faltaPagar: totalMes - jaPago, atrasadas, proximo: pendentes[0] || null };
}
