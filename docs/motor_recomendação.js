// ================================================================
// [Code] Motor de Recomendações v3
// ================================================================
// Node: n8n Code Node (substitui o antigo [Class] Calculate - Complex Rules)
// Input: output do [Class] Get Metrics (via $input ou $('Get Metrics'))
// Output: JSON estruturado para o AI Agent montar o HTML
// ================================================================

// --- Leitura do input ---
// Ajuste o seletor conforme o nome do node anterior no seu workflow
const metricsItem = $input.first().json;
// Se o objeto vier encapsulado em "metrics", desembrulha
const metrics = metricsItem.metrics || metricsItem;

// ================================================================
// HELPERS
// ================================================================
const num = (val) => { const n = Number(val); return isNaN(n) ? 0 : n; };

const parseFirstNumber = (str) => {
  if (!str) return null;
  const m = str.match(/([\d.]+)/);
  return m ? num(m[1]) : null;
};

const parsePoints = (str) => {
  if (!str) return null;
  const m = str.match(/(\d+)\s*pt/i);
  return m ? num(m[1]) : null;
};

const formatarNome = (nome) => {
  if (!nome) return "";
  const prep = ["da", "de", "do", "das", "dos"];
  return nome.toLowerCase()
    .split(" ")
    .map(p => prep.includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
};

// Helper: formata número float para exibição limpa (sem artefatos de floating point)
const fmtNum = (v, decimals = 2) => parseFloat(v.toFixed(decimals));

// Branco Ártico e Preto vêm da planilha como (ORIGINAL), mas pertencem à família ULTRA.
// Normalizamos na leitura para manter comparações e exibição consistentes.
const normalizarLabelG1 = (label) => {
  if (!label) return label;
  if (label === "BRANCO ÁRTICO (ORIGINAL)") return "BRANCO ÁRTICO (ULTRA)";
  if (label === "PRETO (ORIGINAL)") return "PRETO (ULTRA)";
  return label;
};
const normalizarItemG1 = (item) => ({ ...item, label: normalizarLabelG1(item.label) });

// ================================================================
// FLAGS DE COMPORTAMENTO (hooks reversíveis)
// ================================================================
// OVERSHOOT_STRATEGY controla seleção adaptativa de ações:
//   "adaptive" — (padrão) Pula ação atual se alguma posterior fecha o gap
//                sozinha ou com menos overshoot. Minimiza nº de ações e overshoot.
//   "strict"   — Ordem fixa sempre. Motor adiciona G1, Lanç, Ultra, etc. na ordem,
//                sem pular, e para só quando o gap é fechado.
const OVERSHOOT_STRATEGY = "adaptive";

// ================================================================
// REGRAS HARDCODED
// ================================================================
const CORINGA_THRESHOLDS = [
  { threshold: 40, score: 10, rule: "Soma dos Meios == 40 pontos GANHA 10 pontos" },
  { threshold: 45, score: 5,  rule: "Soma dos Meios == 45 pontos GANHA 5 pontos" },
  { threshold: 50, score: 0,  rule: "Soma dos Meios == 50 pontos GANHA 0 pontos" }
];

// ================================================================
// EXTRAÇÃO DOS DADOS
// ================================================================
const politica     = metrics["Politica"]?.values || {};
const profPontos   = metrics["Profundidade Pontos"]?.values || {};
const grupo1       = metrics["Profundidade Grupo 1"]?.values || {};
const ultimos12m   = metrics["Profundidade Últimos 12 meses"]?.values || {};
const lancamentos  = metrics["Profundidade Lançamentos"]?.values || {};
const ultra        = metrics["Profundidade Ultra Premium"]?.values || {};
const volume       = metrics["Volume"]?.values || {};
const metaTotalRaw = metrics["Meta Total"]?.values || {};
const metaNobreRaw = metrics["Meta Nobre"]?.values || {};
const perfRede     = metrics["Performance Rede"]?.values || {};

// ================================================================
// PARSE DAS REGRAS DINÂMICAS
// ================================================================
const g1Threshold = parseFirstNumber(grupo1.regraAtual) || 10;
const g1MaxPoints = parsePoints(grupo1.regraAtual) || 10;

const lancRegras = (lancamentos.regrasAtuais || [])
  .map(r => ({ threshold: parseFirstNumber(r), points: parsePoints(r), regra: r }))
  .filter(r => r.threshold !== null && r.points !== null)
  .sort((a, b) => b.threshold - a.threshold);

const ultraThreshold = parseFirstNumber(ultra.regraAtual?.split(';')[0]) || 15;
const ultraMaxPoints = parsePoints(ultra.regraAtual?.split(';')[0]) || 10;
const nobreMaxPoints = parsePoints(metaNobreRaw.regraAtual) || 10;
const totalMaxPoints = parsePoints(metaTotalRaw.regraAtual) || 10;
const redeMaxPoints = 10;

// ================================================================
// SCORES EFETIVOS
// ================================================================
const profPontosScore = num(profPontos.posicaoAtual?.pontuacaoGanha);

const g1Validos = num(grupo1.quantidadeValidos);
const g1Met = g1Validos >= g1Threshold;
const g1EffScore = g1Met ? g1MaxPoints : 0;

const lancValidos = num(lancamentos.quantidadeValidos);
let lancEffScore = 0;
for (const r of lancRegras) { if (lancValidos >= r.threshold) { lancEffScore = r.points; break; } }

const ultraValorAtual = num(ultra.valorAtual);
const ultraMet = ultraValorAtual >= ultraThreshold;
const ultraEffScore = ultraMet ? ultraMaxPoints : 0;

const nobreMeta     = num(metaNobreRaw.itensAgrupados?.[0]?.valor);
const nobreCarteira = num(metaNobreRaw.itensAgrupados?.[1]?.valor);
const nobreMet = nobreMeta > 0 && (nobreCarteira / nobreMeta) >= 0.98;
const nobreEffScore = nobreMet ? nobreMaxPoints : 0;

const totalMeta     = num(metaTotalRaw.itensAgrupados?.[0]?.valor);
const totalCarteira = num(metaTotalRaw.itensAgrupados?.[1]?.valor);
const totalMet = totalMeta > 0 && (totalCarteira / totalMeta) >= 0.98;
const totalEffScore = totalMet ? totalMaxPoints : 0;

const volumeEffScore = num(volume.posicaoAtual?.pontuacaoGanha);

const redeNobrePct = parseFloat(perfRede.percentilNobre) || 0;
const redeTotalPct = parseFloat(perfRede.percentilTotal) || 0;
const redeMet = redeNobrePct >= 100;
const redeEffScore = redeMet ? redeMaxPoints : 0;

let scoreEfetivo = profPontosScore + g1EffScore + lancEffScore
  + ultraEffScore + nobreEffScore + totalEffScore
  + volumeEffScore + redeEffScore;

// ================================================================
// GAPS
// ================================================================
const scoreManter = num(politica.ultimoTrimestre?.score);
let scoreSubir    = num(politica.proximoNivel?.score);
let proximoNivelEfetivo = {
  posicao: politica.proximoNivel?.posicao || "",
  score: scoreSubir,
  desconto: num(politica.proximoNivel?.desconto)
};

// ================================================================
// NOBRE / TOTAL
// ================================================================
const precisaNobre = Math.abs(num(metaNobreRaw.itensAgrupados?.[1]?.vsMeta));
const precisaTotal = Math.abs(num(metaTotalRaw.itensAgrupados?.[1]?.vsMeta));
const precisaMaisParaTotal = Math.max(0, precisaTotal - precisaNobre);

// ================================================================
// CRUZAMENTO GRUPO 1 × ÚLTIMOS 12 MESES (com prioridade multi-impacto)
// ================================================================
// Lista de prioridade G1 (curva BC — ordem definida pelo cliente)
const G1_ORDEM_PRIORIDADE = [
  "GIANDUIA (TRAMA)",
  "BRANCO ÁRTICO (ULTRA)",
  "TITÂNIO (TRAMA)",
  "OFF WHITE SUAVE (SENSE)",
  "PALHA (TRAMA)",
  "AURORA (TRAMA)",
  "GIANDUIA PURO (SENSE)",
  "CARVALHO DIAN (PRISMA)",
  "NOCE AMÊNDOA (ESSENCIAL)",
  "LINHO BELGA (SENSE)",
  "PRETO (ULTRA)",
  "AMÊNDOLA RÚSTICA (PRISMA)",
  "CARVALHO LIR (PRISMA)",
  "NOCE MARE (ESSENCIAL)",
  "LARNACA (PRISMA)",
  "RIVIERA (PRISMA)",
  "NOGUEIRA CADIZ (PRISMA)"
];

// Helper: posição na lista de prioridade (itens fora da lista vão pro final)
const g1Posicao = (label) => {
  const idx = G1_ORDEM_PRIORIDADE.indexOf(label);
  return idx >= 0 ? idx : 999;
};

// Prioridade: 1º ULTRA+hist, 2º Normal+hist (ambos ordenados pela lista)
const itensOk12m = new Set(
  (ultimos12m.itensValidos || []).filter(i => i.status === "OK").map(i => normalizarLabelG1(i.label))
);

const isUltra = (item) => (item.group || "").toUpperCase().includes("ULTRA");

// Top-down pela curva ABC: pega os inválidos na ordem da lista de prioridade.
// Itens fora da lista vão para o final (g1Posicao retorna 999).
const g1Invalidos = (grupo1.itensInvalidos || [])
  .map(normalizarItemG1)
  .sort((a, b) => g1Posicao(a.label) - g1Posicao(b.label));

const g1ItensPriorizados = g1Invalidos.map(i => i.label);

// Set de labels ULTRA para ⭐ e cross-reference com Ultra Premium
const g1UltraLabels = new Set(g1Invalidos.filter(isUltra).map(i => i.label));

// Sub-listas informativas (com/sem histórico 12m) — metadado, não reordena
const g1ItensSugestiveis = g1Invalidos.filter(i => itensOk12m.has(i.label)).map(i => i.label);
const g1ItensSemHistorico = g1Invalidos.filter(i => !itensOk12m.has(i.label)).map(i => i.label);

// ================================================================
// PROFUNDIDADE GERAL (agora com múltiplos tiers, como Volume)
// ================================================================
const profAtualPts = num(profPontos.posicaoAtual?.pontuacaoGanha);
// Tier de dificuldade: 'facil' (< 10), 'media' (10-30), 'impossivel' (> 30).
// IMPOSSÍVEL é usado apenas como último recurso (fallback após Volume).
const classificarProfTier = (falta) => {
  if (falta < 10) return "facil";
  if (falta <= 30) return "media";
  return "impossivel";
};
const profNiveis = (profPontos.proximosNiveis || []).map(n => ({
  metaNecessaria: num(n.metaNecessaria),
  pontuacaoPossivel: num(n.pontuacaoPossivel),
  faltaParaNivel: num(n.faltaParaNivel),
  pontosIncrementais: num(n.pontuacaoPossivel) - profAtualPts,
  tier: classificarProfTier(num(n.faltaParaNivel))
})).filter(n => n.faltaParaNivel > 0 && n.pontosIncrementais > 0);

// ================================================================
// VOLUME
// ================================================================
const metaTotalValor = num(metaTotalRaw.itensAgrupados?.[0]?.valor);
// Meses restantes no trimestre (Q1=Jan-Mar, Q2=Abr-Jun, Q3=Jul-Set, Q4=Out-Dez)
const mesAtual = new Date().getMonth() + 1; // 1-12
const mesesRestantes = Math.max(1, 3 - ((mesAtual - 1) % 3));

const volumeNiveis = (volume.proximosNiveis || []).map(n => {
  const metaMensal = num(n.metaNecessaria);
  const metaTrimestral = num(n.metaTrimestral) || metaMensal * 3;
  const pontuacaoAtual = num(n.pontuacaoAtual);
  // Prioriza faltaParaNivelTrimestre; fallback: recalcula corretamente
  const faltaTrimestre = num(n.faltaParaNivelTrimestre)
    || Math.max(0, Math.ceil(metaTrimestral - pontuacaoAtual));
  const faltaMensal = Math.ceil(faltaTrimestre / mesesRestantes);
  const palletsTrimestre = Math.ceil(faltaTrimestre / 3);
  const palletsMensal = Math.ceil(faltaMensal / 3);
  const ratio = metaTotalValor > 0 ? faltaTrimestre / metaTotalValor : 999;
  return {
    metaMensal,
    metaTrimestral,
    pontuacaoPossivel: num(n.pontuacaoPossivel),
    pontosIncrementais: num(n.pontuacaoPossivel) - volumeEffScore,
    pontuacaoAtual,
    faltaM3Trimestre: faltaTrimestre,
    faltaM3Mensal: faltaMensal,
    palletsTrimestre,
    palletsMensal,
    facil: ratio < 1.30
  };
}).filter(n => n.faltaM3Trimestre > 0 && n.pontosIncrementais > 0);

// ================================================================
// CORINGA GARANTIDO — incluir no score base quando já conquistado
// ================================================================
// Condição: Rede Nobres ≥ 100% (redeMet) E Rede Total ≥ 100% (redeTotalPct)
// Bônus baseado na soma dos meios ATUAIS (já conquistados, sem projeção)
let coringaGarantidoBase = 0;
if (redeMet && redeTotalPct >= 100) {
  const somaAtualMeios = profAtualPts + g1EffScore + lancEffScore + ultraEffScore;
  for (const ct of CORINGA_THRESHOLDS) {
    if (somaAtualMeios >= ct.threshold) coringaGarantidoBase = ct.score;
  }
  if (coringaGarantidoBase > 0) {
    scoreEfetivo += coringaGarantidoBase;
  }
}

// ================================================================
// RECÁLCULO DO PRÓXIMO NÍVEL (baseado na posição efetiva)
// ================================================================
// Se scoreEfetivo já atingiu ou ultrapassou o proximoNivel do sistema,
// buscar o próximo nível REAL na tabelaPosicoes.
const tabelaPosicoes = politica.tabelaPosicoes || [];
if (tabelaPosicoes.length > 0 && scoreEfetivo >= scoreSubir) {
  // Encontra a posição efetiva atual
  let posEfetivaIdx = -1;
  for (let i = 0; i < tabelaPosicoes.length; i++) {
    if (scoreEfetivo >= num(tabelaPosicoes[i].score)) posEfetivaIdx = i;
  }
  // Próximo nível = posição seguinte na tabela
  if (posEfetivaIdx >= 0 && posEfetivaIdx + 1 < tabelaPosicoes.length) {
    const realProximo = tabelaPosicoes[posEfetivaIdx + 1];
    scoreSubir = num(realProximo.score);
    proximoNivelEfetivo = {
      posicao: realProximo.posicao,
      score: scoreSubir,
      desconto: num(realProximo.desconto)
    };
  }
  // Se já está no último nível (máximo), scoreSubir fica 0 → cenários SUBIR terão jaAtingida
}

// ================================================================
// CORREÇÃO: MANTER >= SUBIR (cliente caiu de posição entre trimestres)
// ================================================================
// Quando o parceiro caiu de posição, o alvo do MANTER (ultimoTrimestre) pode ficar
// ACIMA do alvo do SUBIR (proximoNivel do sistema). Nesse caso, o cenário SUBIR
// apontaria para um alvo MENOR que o MANTER — semanticamente absurdo.
// Correção: empurrar SUBIR para a posição acima de ultimoTrimestre.
// Se ultimoTrimestre já for o topo da tabela (A), omitir os cenários SUBIR.
let omitirSubirPorManterMaior = false;
if (tabelaPosicoes.length > 0 && scoreManter > 0 && scoreManter >= scoreSubir) {
  const posManter = politica.ultimoTrimestre?.posicao;
  let manterIdx = -1;
  for (let i = 0; i < tabelaPosicoes.length; i++) {
    if (tabelaPosicoes[i].posicao === posManter) { manterIdx = i; break; }
  }
  if (manterIdx >= 0 && manterIdx + 1 < tabelaPosicoes.length) {
    // Existe posição acima do MANTER → SUBIR aponta para ela
    const realProximo = tabelaPosicoes[manterIdx + 1];
    scoreSubir = num(realProximo.score);
    proximoNivelEfetivo = {
      posicao: realProximo.posicao,
      score: scoreSubir,
      desconto: num(realProximo.desconto)
    };
  } else {
    // ultimoTrimestre já é o topo da tabela → SUBIR deve ser omitido
    omitirSubirPorManterMaior = true;
  }
}

// ================================================================
// MOTOR DE CENÁRIOS
// ================================================================
const buildCenario = (label, pontosAlvo, posAlvo, descAlvo, isCenarioRede) => {
  const gap = Math.max(0, pontosAlvo - scoreEfetivo);

  if (gap <= 0) {
    // Se Coringa já está no scoreEfetivo (coringaGarantidoBase > 0), não recalcular.
    // Senão, calcular notaCoringa quando:
    //   - Cenário Rede + rede Nobre batida → informativo ou garantido
    //   - Qualquer cenário + rede Total ≥ 100% → garantido
    let notaCoringaEarly = null;
    const deveCalcularEarly = coringaGarantidoBase === 0 && (
      (isCenarioRede && redeMet) ||
      (!isCenarioRede && redeTotalPct >= 100)
    );
    if (deveCalcularEarly) {
      const projProf = profAtualPts;
      const projG1 = g1EffScore;
      const projLanc = lancEffScore;
      const projUltra = ultraEffScore;
      const soma = projProf + projG1 + projLanc + projUltra;
      let bonus = 0;
      for (const ct of CORINGA_THRESHOLDS) { if (soma >= ct.threshold) bonus = ct.score; }
      if (bonus > 0) {
        const redeTotalJaBatida = redeTotalPct >= 100;
        notaCoringaEarly = {
          bonus,
          somaMeios: soma,
          composicao: { profPontos: projProf, grupo1: projG1, lancamentos: projLanc, ultra: projUltra },
          redeTotal: {
            percentualAtual: perfRede.percentilTotal || "0%",
            falta: `${(100 - redeTotalPct).toFixed(1)}pp`,
            jaBatida: redeTotalJaBatida
          },
          descricao: redeTotalJaBatida
            ? `+${bonus}pts. Soma dos meios projetada: ${soma}pts (Prof: ${projProf} + G1: ${projG1} + Lanç: ${projLanc} + Ultra: ${projUltra}).`
            : `+${bonus}pts (condicionado à rede atingir 100% meta Total). Soma dos meios projetada: ${soma}pts (Prof: ${projProf} + G1: ${projG1} + Lanç: ${projLanc} + Ultra: ${projUltra}).`
        };
      }
    }
    return {
      titulo: label,
      posicaoAlvo: posAlvo,
      descontoAlvo: `${Math.round(descAlvo)}%`,
      pontosAlvo,
      pontosAtuais: scoreEfetivo,
      gap: 0,
      jaAtingida: true,
      cenarioViavel: true,
      mensagem: "Meta já atingida! Mantenha o ritmo.",
      acoes: [],
      notaCoringa: notaCoringaEarly
    };
  }

  // --- Monta ações na ordem de prioridade ---
  const acoesPossiveis = [];

  // Pos 1: Grupo 1
  let g1ItensUltraRecomendados = []; // rastreamento para uso no Ultra Premium
  if (!g1Met) {
    const faltam = g1Threshold - g1Validos;
    const itensRaw = g1ItensPriorizados.slice(0, faltam);
    g1ItensUltraRecomendados = itensRaw.filter(i => g1UltraLabels.has(i));
    
    // Tagueamento: itens ULTRA recebem ⭐
    const itensTagueados = itensRaw.map(label => 
      g1UltraLabels.has(label) ? `${label} ⭐` : label
    );
    
    acoesPossiveis.push({
      pos: 1, nome: "Positivação Grupo 1", pontos: g1MaxPoints,
      descricao: `Comprar ${faltam} padrões do Grupo 1 para garantir +${g1MaxPoints}pts.`,
      itens: itensTagueados,
      itensComHistorico: itensRaw.filter(i => g1ItensSugestiveis.includes(i)),
      itensSemHistorico: itensRaw.filter(i => g1ItensSemHistorico.includes(i)),
      itensUltra: g1ItensUltraRecomendados
    });
  }

  // Pos 2: Lançamentos — cria uma sub-ação por tier (ordem adaptativa escolherá)
  if (lancEffScore < (lancRegras[0]?.points || 0)) {
    const lancItens = (lancamentos.itensInvalidos || []).map(i => i.label);
    // Tiers ordenados do MENOR para o MAIOR ganho incremental (menor esforço primeiro)
    const tiersOrdenados = [...lancRegras]
      .filter(tier => tier.points > lancEffScore && lancItens.length >= (tier.threshold - lancValidos))
      .sort((a, b) => a.points - b.points);
    // Cada tier vira uma ação marcada com _isLancTier para o handler
    tiersOrdenados.forEach((tier, tierIdx) => {
      const faltam = tier.threshold - lancValidos;
      const incremento = tier.points - lancEffScore;
      acoesPossiveis.push({
        pos: 2 + tierIdx * 0.01, // sub-ordem entre tiers de Lanç
        nome: "Positivação de Lançamentos",
        pontos: incremento,
        pontosAbsolutos: tier.points,
        _isLancTier: true,
        descricao: `Implantar ${faltam} lançamentos para garantir +${incremento}pts.`,
        itens: lancItens.slice(0, faltam)
      });
    });
  }

  // Pos 3: Ultra Premium
  if (!ultraMet) {
    const faltaM3 = Math.max(0, ultraThreshold - ultraValorAtual);
    const faltaPallets = Math.ceil(faltaM3 / 3);
    
    let descUltra;
    if (g1ItensUltraRecomendados.length > 0) {
      const nomesUltra = g1ItensUltraRecomendados.join(", ");
      descUltra = `Comprar ${faltaM3.toFixed(1)}m³ de Ultra Premium (≈${faltaPallets} pallets) para garantir +${ultraMaxPoints}pts. Aproveite para comprar do ${nomesUltra} já sugerido no Grupo 1, atendendo ambas as metas com uma única ação.`;
    } else {
      descUltra = `Comprar ${faltaM3.toFixed(1)}m³ de Ultra Premium (≈${faltaPallets} pallets) para garantir +${ultraMaxPoints}pts.`;
    }
    
    acoesPossiveis.push({
      pos: 3, nome: "Meta Ultra Premium", pontos: ultraMaxPoints,
      descricao: descUltra,
    });
  }

  // Pos 0: Performance da Rede (cálculo primeiro no cenário Rede;
  // exibição é movida para o fim em pós-processamento)
  if (isCenarioRede && !redeMet) {
    acoesPossiveis.push({
      pos: 0, nome: "Performance da Rede", pontos: redeMaxPoints,
      descricao: `Se a rede atingir 100% da meta Nobres, garante +${redeMaxPoints}pts. Além disso, se a rede atingir 100% da meta Total você ganha um bônus Coringa adicional.`,
      dependeDaEquipe: true
    });
  }

  // Pos 4: Meta Nobre
  if (!nobreMet) {
    acoesPossiveis.push({
      pos: 4, nome: "Meta Nobres", pontos: nobreMaxPoints,
      descricao: `Comprar +${precisaNobre}m³ em produtos Nobres para atingir a meta e garantir +${nobreMaxPoints}pts.`,
    });
  }

  // Pos 5: Meta Total (dinâmica)
  if (!totalMet) {
    acoesPossiveis.push({
      pos: 5, nome: "Meta Total", pontos: totalMaxPoints,
      _isDynamic: true
    });
  }

  // Pos 6: Prof Geral FÁCIL (< 10 padrões faltantes)
  if (profNiveis.some(n => n.tier === "facil")) {
    acoesPossiveis.push({ pos: 6, _isProfFacil: true });
  }

  // Pos 7: Prof Geral MÉDIA (10-30 padrões faltantes)
  if (profNiveis.some(n => n.tier === "media")) {
    acoesPossiveis.push({ pos: 7, _isProfMedia: true });
  }

  // Pos 8: Volume FÁCIL
  acoesPossiveis.push({ pos: 8, _isVolumeFacil: true });

  // Pos 9: Volume DIFÍCIL
  acoesPossiveis.push({ pos: 9, _isVolumeDificil: true });

  // Pos 10: Prof Geral IMPOSSÍVEL (> 30 padrões faltantes) — último recurso
  if (profNiveis.some(n => n.tier === "impossivel")) {
    acoesPossiveis.push({ pos: 10, _isProfImpossivel: true });
  }

  acoesPossiveis.sort((a, b) => a.pos - b.pos);

  // --- Executar ações até fechar o gap ---
  let pontosAcumulados = 0;
  const acoesFinais = [];
  const acoesPuladas = new Set(); // índices já processados (executados ou descartados via lookahead)
  let nobreRecomendada = false;
  let redeRecomendada = false;
  let profGeralTierSelecionado = null; // tier selecionado para Coringa
  let lancTierSelecionado = false;     // guard: uma Lanç por cenário
  let lancRecomendadaPts = 0;

  // Helper: simula o bônus Coringa para um dado tier de Prof Geral
  const simularCoringa = (profTier) => {
    const projProf = profTier ? profTier.pontuacaoPossivel : profAtualPts;
    const projG1 = acoesFinais.find(a => a.nome?.includes("Grupo 1")) ? g1MaxPoints : g1EffScore;
    const projLanc = acoesFinais.find(a => a.nome?.includes("Lançamentos"))
      ? (lancRecomendadaPts || lancEffScore) : lancEffScore;
    const projUltra = ultraMet ? ultraMaxPoints
      : (acoesFinais.find(a => a.nome?.includes("Ultra")) ? ultraMaxPoints : 0);
    const soma = projProf + projG1 + projLanc + projUltra;
    let bonus = 0;
    for (const ct of CORINGA_THRESHOLDS) { if (soma >= ct.threshold) bonus = ct.score; }
    return bonus;
  };

  // Helper: calcula bônus Coringa para uma dada soma de meios
  const coringaParaSoma = (soma) => {
    let bonus = 0;
    for (const ct of CORINGA_THRESHOLDS) { if (soma >= ct.threshold) bonus = ct.score; }
    return bonus;
  };

  // Helper: calcula soma dos meios projetada com estado atual de acoesFinais
  const somaMeiosAtual = () => {
    const pProf = profGeralTierSelecionado ? profGeralTierSelecionado.pontuacaoPossivel : profAtualPts;
    const pG1 = acoesFinais.find(a => a.nome?.includes("Grupo 1")) ? g1MaxPoints : g1EffScore;
    const pLanc = acoesFinais.find(a => a.nome?.includes("Lançamentos"))
      ? (lancRecomendadaPts || lancEffScore) : lancEffScore;
    const pUltra = ultraMet ? ultraMaxPoints
      : (acoesFinais.find(a => a.nome?.includes("Ultra")) ? ultraMaxPoints : 0);
    return pProf + pG1 + pLanc + pUltra;
  };

  // Flag: Coringa deve ser considerado ao calcular gap e pular ações
  // - GARANTIDO: rede Total ≥ 100% e Coringa não está no base
  // - CONDICIONAL (cenário Rede): já dependemos da performance da rede naquele cenário,
  //   então contar o Coringa condicional é consistente com contar a ação Performance da Rede
  const coringaOtimizacaoAtiva = coringaGarantidoBase === 0 && (redeTotalPct >= 100 || isCenarioRede);

  // Helper: seleciona o menor tier que feche o gap (evita overshoot).
  // Se nenhum tier sozinho fecha, pega o maior disponível.
  // Em cenários com Coringa ativo, o tie-break prefere o tier que maximiza Coringa.
  const selecionarProfTier = (tiersDisponiveis, gapRestante) => {
    if (tiersDisponiveis.length === 0) return null;

    const ordenados = [...tiersDisponiveis].sort((a, b) => a.pontosIncrementais - b.pontosIncrementais);
    const queFecham = ordenados.filter(n => n.pontosIncrementais >= gapRestante);

    if (queFecham.length === 0) {
      // Nenhum tier sozinho fecha — pega o maior
      return ordenados[ordenados.length - 1];
    }

    // Menor valor incremental que fecha é a escolha ideal (menor overshoot)
    const menorIncremental = queFecham[0].pontosIncrementais;
    const candidatos = queFecham.filter(n => n.pontosIncrementais === menorIncremental);

    if (candidatos.length === 1) return candidatos[0];

    // Empate: se Coringa está ativo, prefere o tier que maximiza Coringa
    if (isCenarioRede || coringaOtimizacaoAtiva) {
      return candidatos.reduce((melhor, atual) =>
        simularCoringa(atual) > simularCoringa(melhor) ? atual : melhor
      );
    }
    return candidatos[0];
  };

  // Helper: simula quantos pontos a ação adicionaria se executada agora.
  // Usado para lookahead (decidir se uma ação posterior fecharia com menos overshoot).
  const simularPontosDaAcao = (acao) => {
    // Meta Total: sempre totalMaxPoints (dinâmica mas pontuação fixa)
    if (acao._isDynamic && acao.nome === "Meta Total") return totalMaxPoints;

    // Prof Geral: depende do tier escolhido pelo selecionarProfTier.
    // Inclui o DELTA do Coringa que essa escolha ativaria (soma de meios muda).
    const profTier = acao._isProfFacil ? "facil"
      : acao._isProfMedia ? "media"
      : acao._isProfImpossivel ? "impossivel"
      : null;
    if (profTier) {
      if (profGeralTierSelecionado) return 0;
      const tiers = profNiveis.filter(n => n.tier === profTier);
      const gapRestante = Math.max(0, gap - pontosAcumulados);
      const nivel = selecionarProfTier(tiers, gapRestante);
      if (!nivel) return 0;
      // Delta Coringa: mudança no bônus ao trocar profAtualPts por nivel.pontuacaoPossivel na soma de meios
      let deltaCoringa = 0;
      if (coringaOtimizacaoAtiva) {
        const somaBase = somaMeiosAtual();
        const somaComTier = somaBase - profAtualPts + nivel.pontuacaoPossivel;
        deltaCoringa = coringaParaSoma(somaComTier) - coringaParaSoma(somaBase);
      }
      return nivel.pontosIncrementais + deltaCoringa;
    }

    // Volume FÁCIL/DIFÍCIL: encontra o menor tier que fecha
    if (acao._isVolumeFacil || acao._isVolumeDificil) {
      let gapRestante = gap - pontosAcumulados;
      if (coringaOtimizacaoAtiva) {
        gapRestante = Math.max(0, gapRestante - simularCoringa(profGeralTierSelecionado));
      }
      if (gapRestante <= 0) return 0;
      const filtro = acao._isVolumeFacil ? (n) => n.facil : (n) => !n.facil;
      const candidatos = volumeNiveis.filter(filtro);
      const fecha = candidatos.find(n => n.pontosIncrementais >= gapRestante);
      if (fecha) return fecha.pontosIncrementais;
      // Nenhum tier fecha sozinho → retorna o MAIOR disponível dessa dificuldade
      // (útil para adaptive saber que ação pode contribuir parcialmente)
      if (candidatos.length > 0) {
        return [...candidatos].sort((a, b) => b.pontosIncrementais - a.pontosIncrementais)[0].pontosIncrementais;
      }
      return 0;
    }

    // Lançamentos com tier — só 1 por cenário
    if (acao._isLancTier && lancTierSelecionado) return 0;

    // Ações normais (G1, Lançamentos, Ultra, Nobre, Rede) — pontos fixos
    return num(acao.pontos);
  };

  // Helper: classifica grupo estratégico da ação.
  // Ações "primárias" (G1, Lanç, Ultra, Nobres, Total) têm valor estratégico alto
  // e nunca são puladas por ações "secundárias" (Prof Geral, Volume).
  // Performance da Rede no cenário Rede também é primária (garantida, não pula).
  const grupoEstrategico = (acao) => {
    if (acao.nome === "Performance da Rede") return "primaria";
    // G1=1, Lanç=2, Ultra=3, Nobre=4, Total=5 → primárias
    // Prof Fácil=6, Prof Média=7, Vol Fácil=8, Vol Difícil=9, Prof Impossível=10 → secundárias
    return acao.pos >= 1 && acao.pos <= 5 ? "primaria" : "secundaria";
  };

  // Helper: escolhe o índice da próxima ação a executar, aplicando ordem adaptativa.
  // Regras (estratégia "adaptive"):
  //   1. Se a ação atual causa overshoot, procura posterior com menor overshoot
  //      dentro do MESMO grupo estratégico (primária/secundária).
  //   2. Se a atual NÃO fecha o gap sozinha mas alguma posterior fecha sozinha,
  //      pula a atual e usa a posterior — preservando o grupo estratégico da atual
  //      (primária só pula por primária, secundária pode pular por qualquer).
  //   3. Caso contrário, mantém a ordem fixa.
  // Em "strict", sempre mantém a ordem fixa.
  const escolherProximaAcao = (indiceAtual) => {
    const acao = acoesPossiveis[indiceAtual];
    // Coringa projetado entra como "ponte" — tanto a ação atual quanto as posteriores
    // somam com ele. Descontamos do gap para a decisão do adaptive.
    const coringaProj = coringaOtimizacaoAtiva ? simularCoringa(profGeralTierSelecionado) : 0;
    const gapRestante = Math.max(0, gap - pontosAcumulados - coringaProj);
    const pontosAtual = simularPontosDaAcao(acao);

    // Sem pontos (ex: Prof já escolhida) → pula silenciosamente
    if (pontosAtual <= 0) return indiceAtual;

    if (OVERSHOOT_STRATEGY === "strict") return indiceAtual;

    const grupoAtual = grupoEstrategico(acao);

    // Coleta candidatas posteriores que fechariam o gap sozinhas.
    // Se a atual é primária, só considera posteriores primárias
    // (não pula ação estratégica por secundária).
    const posterioresQueFecham = [];
    for (let j = indiceAtual + 1; j < acoesPossiveis.length; j++) {
      if (acoesPuladas.has(j)) continue;
      const candidata = acoesPossiveis[j];
      if (grupoAtual === "primaria" && grupoEstrategico(candidata) !== "primaria") continue;
      const pontosDela = simularPontosDaAcao(candidata);
      if (pontosDela <= 0) continue;
      if (pontosDela < gapRestante) continue; // não fecha sozinha
      posterioresQueFecham.push({ idx: j, overshoot: pontosDela - gapRestante });
    }

    const atualFecha = pontosAtual >= gapRestante;

    // Regra 2: atual NÃO fecha sozinha mas alguma posterior fecha com OVERSHOOT ZERO → pular.
    // Se a posterior que fecha sozinha também causa overshoot, preferimos deixar a atual
    // contribuir parcialmente (distribuir em ações menores para fechar exato).
    if (!atualFecha && posterioresQueFecham.length > 0) {
      const fechaSemOvershoot = posterioresQueFecham.filter(p => p.overshoot === 0);
      if (fechaSemOvershoot.length > 0) {
        fechaSemOvershoot.sort((a, b) => a.idx - b.idx);
        acoesPuladas.add(indiceAtual);
        return fechaSemOvershoot[0].idx;
      }
      // Nenhuma posterior fecha exato. Mantém a atual para contribuir parcialmente.
      return indiceAtual;
    }

    // Regra 1: atual fecha mas causa overshoot → procurar posterior com menor overshoot.
    // Hierarquia: menor overshoot > menor idx (ordem fixa)
    if (atualFecha) {
      const overshootAtual = pontosAtual - gapRestante;
      const candidatas = [{ idx: indiceAtual, overshoot: overshootAtual }, ...posterioresQueFecham];
      candidatas.sort((a, b) => a.overshoot - b.overshoot || a.idx - b.idx);
      const melhor = candidatas[0];
      if (melhor.idx !== indiceAtual) acoesPuladas.add(indiceAtual);
      return melhor.idx;
    }

    // Atual não fecha e nenhuma posterior fecha → segue ordem fixa (acumular)
    return indiceAtual;
  };

  for (let _i = 0; _i < acoesPossiveis.length; _i++) {
    if (acoesPuladas.has(_i)) continue;
    const idxEscolhido = escolherProximaAcao(_i);
    if (acoesPuladas.has(idxEscolhido)) continue; // proteção extra
    const acao = acoesPossiveis[idxEscolhido];
    acoesPuladas.add(idxEscolhido);

    if (pontosAcumulados >= gap) break;

    // Coringa: se a flag de otimização está ativa, simula se o bônus projetado
    // fecha o gap — se sim, para de recomendar ações.
    // Cobre tanto o caso GARANTIDO (rede Total ≥ 100%) quanto o CONDICIONAL no cenário Rede.
    if (coringaOtimizacaoAtiva) {
      const coringaBonus = simularCoringa(profGeralTierSelecionado);
      if (coringaBonus > 0 && pontosAcumulados + coringaBonus >= gap) break;
    }

    // Lançamentos: só uma variante por cenário (tiers alternativos)
    if (acao._isLancTier && lancTierSelecionado) continue;

    // Meta Total: resolução dinâmica
    if (acao._isDynamic && acao.nome === "Meta Total") {
      let descricaoTotal;
      if (nobreRecomendada && precisaMaisParaTotal <= 0) {
        descricaoTotal = `Ao atingir a Meta Nobres, a Meta Total é automaticamente cumprida. Garante +${totalMaxPoints}pts.`;
      } else if (nobreRecomendada && precisaMaisParaTotal > 0) {
        descricaoTotal = `Comprar +${precisaMaisParaTotal}m³ adicionais (além do volume Nobre) para atingir a Meta Total. Garante +${totalMaxPoints}pts.`;
      } else if (nobreMet) {
        descricaoTotal = `Comprar +${precisaTotal}m³ para atingir a Meta Total. Garante +${totalMaxPoints}pts.`;
      } else {
        descricaoTotal = `Comprar +${precisaTotal}m³ para atingir a Meta Total. Garante +${totalMaxPoints}pts.`;
      }

      pontosAcumulados += totalMaxPoints;
      acoesFinais.push({
        nome: "Meta Total",
        pontos: totalMaxPoints,
        descricao: descricaoTotal,
        scoreAcumulado: scoreEfetivo + pontosAcumulados,
        gapRestante: Math.max(0, gap - pontosAcumulados),
        cobertaPelaNobre: nobreRecomendada && precisaMaisParaTotal <= 0
      });
      continue;
    }

    // Prof Geral FÁCIL / MÉDIA / IMPOSSÍVEL — handler único parametrizado
    const profTierDaAcao = acao._isProfFacil ? "facil"
      : acao._isProfMedia ? "media"
      : acao._isProfImpossivel ? "impossivel"
      : null;
    if (profTierDaAcao) {
      if (profGeralTierSelecionado) continue; // já recomendada neste cenário
      const gapRestante = gap - pontosAcumulados;
      if (gapRestante <= 0) continue;
      const tiersDisponiveis = profNiveis.filter(n => n.tier === profTierDaAcao);
      const nivel = selecionarProfTier(tiersDisponiveis, gapRestante);
      if (nivel) {
        // Otimização Coringa: verificar ganho líquido
        if (coringaOtimizacaoAtiva) {
          const sB = somaMeiosAtual();
          const sA = sB - profAtualPts + nivel.pontuacaoPossivel;
          const ganho = nivel.pontosIncrementais - (coringaParaSoma(sB) - coringaParaSoma(sA));
          if (ganho <= 0) { continue; } // pular — Coringa compensa
        }
        pontosAcumulados += nivel.pontosIncrementais;
        profGeralTierSelecionado = nivel;
        const rotuloDificuldade = profTierDaAcao === "facil" ? "FÁCIL"
          : profTierDaAcao === "media" ? "MÉDIA"
          : "DIFÍCIL";
        acoesFinais.push({
          nome: "Profundidade Geral",
          pontos: nivel.pontosIncrementais,
          descricao: `Positivar mais ${nivel.faltaParaNivel} padrões no portfólio geral para subir de ${profAtualPts} para ${nivel.pontuacaoPossivel}pts (+${nivel.pontosIncrementais}pts).`,
          scoreAcumulado: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados),
          dificuldade: rotuloDificuldade
        });
      }
      continue;
    }

    // Volume FÁCIL
    if (acao._isVolumeFacil) {
      let gapRestante = gap - pontosAcumulados;
      // Desconta Coringa projetado do gap quando disponível (Volume não afeta meios)
      if (coringaOtimizacaoAtiva) {
        gapRestante = Math.max(0, gapRestante - simularCoringa(profGeralTierSelecionado));
      }
      if (gapRestante <= 0) continue;
      const nivel = volumeNiveis.find(n => n.facil && n.pontosIncrementais >= gapRestante);
      if (nivel) {
        pontosAcumulados += nivel.pontosIncrementais;
        const baseDesc = volumeEffScore > 0
          ? `Subir de ${num(volume.posicaoAtual?.metaAtingida)}m³/mês (${volumeEffScore}pts já garantidos) para ${nivel.metaMensal}m³/mês (${nivel.pontuacaoPossivel}pts). Faltam ${nivel.faltaM3Trimestre}m³ acumulados no trimestre, ≈${nivel.palletsTrimestre} pallets. Ganho: +${nivel.pontosIncrementais}pts.`
          : `Atingir volume de ${nivel.metaMensal}m³/mês (faltam ${nivel.faltaM3Trimestre}m³ acumulados no trimestre, ≈${nivel.palletsTrimestre} pallets). Garante +${nivel.pontosIncrementais}pts.`;
        acoesFinais.push({
          nome: "Volume Mensal",
          pontos: nivel.pontosIncrementais,
          descricao: baseDesc,
          scoreAcumulado: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados),
          dificuldade: "FÁCIL"
        });
      }
      continue;
    }

    // Volume DIFÍCIL
    if (acao._isVolumeDificil) {
      let gapRestante = gap - pontosAcumulados;
      if (coringaOtimizacaoAtiva) {
        gapRestante = Math.max(0, gapRestante - simularCoringa(profGeralTierSelecionado));
      }
      if (gapRestante <= 0) continue;
      let nivel = volumeNiveis.find(n => !n.facil && n.pontosIncrementais >= gapRestante);
      if (!nivel) nivel = [...volumeNiveis].filter(n => !n.facil).sort((a, b) => b.pontosIncrementais - a.pontosIncrementais)[0];
      if (!nivel) nivel = volumeNiveis.find(n => n.pontosIncrementais >= gapRestante);
      if (nivel) {
        pontosAcumulados += nivel.pontosIncrementais;
        const baseDesc = volumeEffScore > 0
          ? `Subir de ${num(volume.posicaoAtual?.metaAtingida)}m³/mês (${volumeEffScore}pts já garantidos) para ${nivel.metaMensal}m³/mês (${nivel.pontuacaoPossivel}pts). Faltam ${nivel.faltaM3Trimestre}m³ acumulados no trimestre, ≈${nivel.palletsTrimestre} pallets. Ganho: +${nivel.pontosIncrementais}pts.`
          : `Atingir volume de ${nivel.metaMensal}m³/mês (faltam ${nivel.faltaM3Trimestre}m³ acumulados no trimestre, ≈${nivel.palletsTrimestre} pallets). Garante +${nivel.pontosIncrementais}pts.`;
        acoesFinais.push({
          nome: "Volume Mensal",
          pontos: nivel.pontosIncrementais,
          descricao: baseDesc,
          scoreAcumulado: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados),
          dificuldade: "DIFÍCIL"
        });
      }
      continue;
    }

    // Ações normais
    // Otimização Coringa: verificar ganho líquido para ações que afetam meios
    if (coringaOtimizacaoAtiva) {
      const isG1 = acao.nome?.includes("Grupo 1");
      const isLanc = acao.nome?.includes("Lançamentos");
      const isUltra = acao.nome?.includes("Ultra");
      if (isG1 || isLanc || isUltra) {
        const sB = somaMeiosAtual();
        let deltaMeios = 0;
        if (isG1) deltaMeios = g1MaxPoints - g1EffScore;
        else if (isLanc) deltaMeios = (acao.pontosAbsolutos || acao.pontos) - lancEffScore;
        else if (isUltra) deltaMeios = ultraMaxPoints - (ultraMet ? ultraMaxPoints : 0);
        if (deltaMeios > 0) {
          const ganho = acao.pontos - (coringaParaSoma(sB) - coringaParaSoma(sB + deltaMeios));
          if (ganho <= 0) continue; // pular — Coringa compensa
        }
      }
    }

    pontosAcumulados += acao.pontos;
    if (acao.nome === "Meta Nobres") nobreRecomendada = true;
    if (acao.nome === "Performance da Rede") redeRecomendada = true;
    if (acao.nome?.includes("Lançamentos")) {
      lancRecomendadaPts = acao.pontosAbsolutos || acao.pontos;
      lancTierSelecionado = true;
    }

    const acaoFinal = {
      nome: acao.nome,
      pontos: acao.pontos,
      descricao: acao.descricao,
      scoreAcumulado: scoreEfetivo + pontosAcumulados,
      gapRestante: Math.max(0, gap - pontosAcumulados)
    };
    if (acao.itens) acaoFinal.itens = acao.itens;
    if (acao.itensComHistorico) acaoFinal.itensComHistorico = acao.itensComHistorico;
    if (acao.itensSemHistorico && acao.itensSemHistorico.length > 0) acaoFinal.itensSemHistorico = acao.itensSemHistorico;
    if (acao.dependeDaEquipe) acaoFinal.dependeDaEquipe = true;

    acoesFinais.push(acaoFinal);
  }

  // --- Pós-processamento: remover ações redundantes (anti-overshoot) ---
  // Se remover uma ação ainda mantém o gap fechado, ela é excedente.
  // Preserva Prof Geral e Volume (ações de tier variável — já escolhidas como mínimo).
  // Preserva Performance da Rede (sempre recomendada no cenário Rede).
  if (OVERSHOOT_STRATEGY === "adaptive" && acoesFinais.length > 0) {
    const acoesProtegidas = new Set(["Profundidade Geral", "Performance da Rede", "Volume Mensal"]);
    let removeu = true;
    while (removeu) {
      removeu = false;
      for (let i = 0; i < acoesFinais.length; i++) {
        const a = acoesFinais[i];
        if (acoesProtegidas.has(a.nome)) continue;
        // Soma sem essa ação
        const somaSem = acoesFinais.reduce((acc, x, idx) => idx === i ? acc : acc + x.pontos, 0);
        if (somaSem >= gap) {
          // Remove ação redundante
          acoesFinais.splice(i, 1);
          pontosAcumulados -= a.pontos;
          // Se era Lanç, resetar flag
          if (a.nome?.includes("Lançamentos")) {
            lancTierSelecionado = false;
            lancRecomendadaPts = 0;
          }
          if (a.nome === "Meta Nobres") nobreRecomendada = false;
          removeu = true;
          break;
        }
      }
    }
    // Recalcula scoreAcumulado/gapRestante após remoções
    let acum = 0;
    for (const a of acoesFinais) {
      acum += a.pontos;
      a.scoreAcumulado = scoreEfetivo + acum;
      a.gapRestante = Math.max(0, gap - acum);
    }
  }

  // --- Nota Coringa ---
  // Condição: Coringa não está no base (coringaGarantidoBase === 0) E:
  //   - Cenário Rede: sempre calcula (mesmo que Rede não tenha sido recomendada,
  //     o Coringa pode ter fechado o gap sozinho via break)
  //   - Cenários sem Rede: calcula SE rede Total já ≥ 100% (condição já cumprida)
  // Resultado:
  //   - redeTotalPct >= 100 → GARANTIDO (contabilizado em pontosFinal)
  //   - redeTotalPct < 100  → INFORMATIVO (condicional, só no cenário Rede)
  let notaCoringa = null;
  let coringaCenarioGarantido = 0;
  const deveCalcularCoringa = coringaGarantidoBase === 0 && (
    isCenarioRede ||
    redeTotalPct >= 100
  );
  if (deveCalcularCoringa) {
    const projProf = profGeralTierSelecionado ? profGeralTierSelecionado.pontuacaoPossivel : profAtualPts;
    const projG1   = acoesFinais.find(a => a.nome?.includes("Grupo 1")) ? g1MaxPoints : g1EffScore;
    const projLanc = acoesFinais.find(a => a.nome?.includes("Lançamentos"))
      ? (lancRecomendadaPts || lancEffScore) : lancEffScore;
    const projUltra = ultraMet ? ultraMaxPoints
      : (acoesFinais.find(a => a.nome?.includes("Ultra")) ? ultraMaxPoints : 0);

    const soma = projProf + projG1 + projLanc + projUltra;

    let bonus = 0;
    for (const ct of CORINGA_THRESHOLDS) {
      if (soma >= ct.threshold) bonus = ct.score;
    }

    if (bonus > 0) {
      const redeTotalJaBatida = redeTotalPct >= 100;
      // Coringa conta no pontosFinal quando:
      // - GARANTIDO (rede Total já bateu) — independente de cenário
      // - CONDICIONAL no cenário Rede — já dependemos da rede naquele cenário
      if (redeTotalJaBatida || isCenarioRede) coringaCenarioGarantido = bonus;
      notaCoringa = {
        bonus,
        somaMeios: soma,
        composicao: { profPontos: projProf, grupo1: projG1, lancamentos: projLanc, ultra: projUltra },
        redeTotal: {
          percentualAtual: perfRede.percentilTotal || "0%",
          falta: `${(100 - redeTotalPct).toFixed(1)}pp`,
          jaBatida: redeTotalJaBatida
        },
        descricao: redeTotalJaBatida
          ? `+${bonus}pts. Soma dos meios projetada: ${soma}pts (Prof: ${projProf} + G1: ${projG1} + Lanç: ${projLanc} + Ultra: ${projUltra}).`
          : `+${bonus}pts (condicionado à rede atingir 100% meta Total). Soma dos meios projetada: ${soma}pts (Prof: ${projProf} + G1: ${projG1} + Lanç: ${projLanc} + Ultra: ${projUltra}).`
      };
    }
  }

  // --- Resultado do cenário ---
  const pontosFinal = scoreEfetivo + pontosAcumulados + coringaCenarioGarantido;
  const gapFinal = Math.max(0, gap - pontosAcumulados - coringaCenarioGarantido);

  // Exibição: Performance da Rede entra primeiro no cálculo mas deve aparecer
  // como última ação no e-mail (depende da equipe, não do cliente).
  // Recalcula scoreAcumulado/gapRestante na ordem visual.
  const acoesExibicao = isCenarioRede
    ? [
        ...acoesFinais.filter(a => a.nome !== "Performance da Rede"),
        ...acoesFinais.filter(a => a.nome === "Performance da Rede")
      ]
    : acoesFinais;
  if (isCenarioRede) {
    let acum = 0;
    for (const a of acoesExibicao) {
      acum += num(a.pontos);
      a.scoreAcumulado = scoreEfetivo + acum;
      a.gapRestante = Math.max(0, gap - acum);
    }
  }

  return {
    titulo: label,
    posicaoAlvo: posAlvo,
    descontoAlvo: `${Math.round(descAlvo)}%`,
    pontosAlvo,
    pontosAtuais: scoreEfetivo,
    gap,
    jaAtingida: false,
    cenarioViavel: gapFinal <= 0,
    pontosFinal,
    gapFinal,
    acoes: acoesExibicao,
    notaCoringa,
    mensagem: gapFinal <= 0
      ? `Com essas ações${coringaCenarioGarantido > 0 ? ' + Coringa garantido (+' + coringaCenarioGarantido + 'pts)' : ''}, você atinge ${pontosFinal}pts (necessário: ${pontosAlvo}pts).`
      : `Gap restante de ${gapFinal}pts — não há ações adicionais disponíveis neste cenário.`
  };
};

// ================================================================
// MÉTRICAS GARANTIDAS
// ================================================================
const metricasGarantidas = [];

if (profPontosScore > 0) {
  metricasGarantidas.push({
    nome: "Profundidade de Padrões",
    pontos: profPontosScore,
    detalhe: `${num(profPontos.valorAtual)} padrões positivados.`
  });
}
if (ultraMet) {
  metricasGarantidas.push({
    nome: "Ultra Premium",
    pontos: ultraMaxPoints,
    detalhe: `${fmtNum(ultraValorAtual)}m³ atingidos (meta: ${ultraThreshold}m³). Será contabilizado no fechamento.`
  });
}
if (g1Met) {
  metricasGarantidas.push({
    nome: "Positivação Grupo 1",
    pontos: g1MaxPoints,
    detalhe: `${g1Validos} padrões positivados (meta: ${g1Threshold}).`
  });
}
if (lancEffScore > 0) {
  metricasGarantidas.push({
    nome: "Lançamentos",
    pontos: lancEffScore,
    detalhe: `${lancValidos} lançamentos positivados.`
  });
}
if (nobreMet) {
  metricasGarantidas.push({
    nome: "Meta Nobres",
    pontos: nobreMaxPoints,
    detalhe: `Carteira ${fmtNum(nobreCarteira)}m³ / Meta ${fmtNum(nobreMeta)}m³ (${((nobreCarteira / nobreMeta) * 100).toFixed(1)}%).`
  });
}
if (totalMet) {
  metricasGarantidas.push({
    nome: "Meta Total",
    pontos: totalMaxPoints,
    detalhe: `Carteira ${fmtNum(totalCarteira)}m³ / Meta ${fmtNum(totalMeta)}m³ (${((totalCarteira / totalMeta) * 100).toFixed(1)}%).`
  });
}
if (volumeEffScore > 0) {
  metricasGarantidas.push({
    nome: "Volume",
    pontos: volumeEffScore,
    detalhe: `Meta de volume atingida.`
  });
}
if (redeEffScore > 0) {
  metricasGarantidas.push({
    nome: "Performance da Rede",
    pontos: redeMaxPoints,
    detalhe: `Meta Nobres da rede atingida.`
  });
}
if (coringaGarantidoBase > 0) {
  const somaAtualMeios = profAtualPts + g1EffScore + lancEffScore + ultraEffScore;
  metricasGarantidas.push({
    nome: "Bônus Coringa",
    pontos: coringaGarantidoBase,
    detalhe: `Rede atingiu 100% da meta Total (${perfRede.percentilTotal}). Soma dos meios: ${somaAtualMeios}pts.`
  });
}

// ================================================================
// GERAÇÃO DOS 3 CENÁRIOS
// ================================================================
const cenarioManter = buildCenario(
  `MANTER Política ${politica.ultimoTrimestre?.posicao || ""}`,
  scoreManter,
  politica.ultimoTrimestre?.posicao || "",
  num(politica.ultimoTrimestre?.desconto),
  false
);

// Se Manter já atingida, omitir do e-mail (parceiro já está acima desse nível)
if (cenarioManter.jaAtingida) {
  cenarioManter.omitirDoEmail = true;
}

const cenarioSubir = buildCenario(
  `SUBIR para Política ${proximoNivelEfetivo.posicao}`,
  scoreSubir,
  proximoNivelEfetivo.posicao,
  proximoNivelEfetivo.desconto,
  false
);

const cenarioSubirRede = buildCenario(
  `SUBIR para Política ${proximoNivelEfetivo.posicao} (com a Rede)`,
  scoreSubir,
  proximoNivelEfetivo.posicao,
  proximoNivelEfetivo.desconto,
  true
);

// Se Subir já atingida (parceiro já está no nível máximo), omitir do e-mail
if (cenarioSubir.jaAtingida) {
  cenarioSubir.omitirDoEmail = true;
}
if (cenarioSubirRede.jaAtingida) {
  cenarioSubirRede.omitirDoEmail = true;
}
// Se rede já bateu meta Nobres, SUBIR COM REDE é redundante (rede já contribui no base)
if (redeMet) {
  cenarioSubirRede.omitirDoEmail = true;
}
// Se MANTER já cobre o alvo máximo da tabela (ultimoTrimestre = topo), omitir SUBIR
if (omitirSubirPorManterMaior) {
  cenarioSubir.omitirDoEmail = true;
  cenarioSubirRede.omitirDoEmail = true;
}

// ================================================================
// CONSOLIDAÇÃO DO CORINGA
// ================================================================
// Se ≥ 2 cenários têm o mesmo Coringa GARANTIDO (jaBatida=true, mesmo bonus),
// mover para metricasGarantidas (último item) e remover dos cenários.
const cenarios = [cenarioManter, cenarioSubir, cenarioSubirRede];
const coringasGarantidos = cenarios
  .filter(c => c.notaCoringa && c.notaCoringa.redeTotal?.jaBatida && c.notaCoringa.bonus > 0)
  .map(c => c.notaCoringa);

if (coringasGarantidos.length >= 2) {
  // Pega o bônus mais comum (em caso de empate, o primeiro)
  const bonusCounts = {};
  for (const nc of coringasGarantidos) {
    bonusCounts[nc.bonus] = (bonusCounts[nc.bonus] || 0) + 1;
  }
  const bonusMaisComum = Number(Object.entries(bonusCounts).sort((a, b) => b[1] - a[1])[0][0]);
  const coringaRef = coringasGarantidos.find(nc => nc.bonus === bonusMaisComum);

  if (coringaRef && bonusCounts[bonusMaisComum] >= 2) {
    // Adicionar em metricasGarantidas como último item
    const comp = coringaRef.composicao;
    metricasGarantidas.push({
      nome: "Bônus Coringa",
      pontos: coringaRef.bonus,
      detalhe: `Soma dos meios projetada: ${coringaRef.somaMeios}pts (Prof: ${comp.profPontos} + G1: ${comp.grupo1} + Lanç: ${comp.lancamentos} + Ultra: ${comp.ultra}).`
    });

    // Remover notaCoringa dos cenários e ajustar gap exibido
    for (const c of cenarios) {
      if (c.notaCoringa && c.notaCoringa.redeTotal?.jaBatida && c.notaCoringa.bonus === bonusMaisComum) {
        c.notaCoringa = null;
        // Ajustar gap exibido — Coringa já aparece no topo como "garantido"
        c.gap = Math.max(0, c.gap - bonusMaisComum);
        c.pontosAtuais = (c.pontosAtuais || 0) + bonusMaisComum;
      }
    }
  }
}

// ================================================================
// OUTPUT PARA O AI AGENT
// ================================================================
// POSIÇÃO EFETIVA (baseada no scoreEfetivo, não no sistema)
// ================================================================
let posicaoEfetiva = politica.posicaoAtual || "";
let descontoEfetivo = num(politica.descontoAtual);
for (const p of tabelaPosicoes) {
  if (scoreEfetivo >= num(p.score)) {
    posicaoEfetiva = p.posicao;
    descontoEfetivo = num(p.desconto);
  }
}

// ================================================================
return {
  json: {
    status: {
      posicaoAtual: posicaoEfetiva,
      descontoAtual: `${Math.round(descontoEfetivo)}%`,
      scoreOficial: num(politica.scoreAtual),
      scoreEfetivo,
      trimestre: politica.labelTriAtual || "",
      ultimoTrimestre: {
        posicao: politica.ultimoTrimestre?.posicao || "",
        score: num(politica.ultimoTrimestre?.score),
        desconto: `${Math.round(num(politica.ultimoTrimestre?.desconto))}%`
      },
      proximoNivel: {
        posicao: proximoNivelEfetivo.posicao,
        score: proximoNivelEfetivo.score,
        desconto: `${Math.round(proximoNivelEfetivo.desconto)}%`
      }
    },

    metricasGarantidas,

    cenarios: {
      manter: cenarioManter,
      subirIndividual: cenarioSubir,
      subirComRede: cenarioSubirRede
    }
  }
};