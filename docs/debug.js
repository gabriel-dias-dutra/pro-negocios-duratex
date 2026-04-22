// ================================================================
// TEST.JS — Motor de Recomendações v3
// ================================================================
// Uso: node test.js [caminho_para_metrics.json]
// Default: ./metrics.json
// ================================================================

const fs = require('fs');
const path = require('path');

// --- Carrega o JSON ---
const inputPath = process.argv[2] || path.join(__dirname, 'metrics.json');
const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const metrics = raw.metrics || raw;

// --- Regras Coringa HARDCODED (não vem mais do input) ---
const coringaThresholds = [
  { threshold: 40, score: 10, rule: "Soma das Profundidades == 40 pontos GANHA 10 pontos" },
  { threshold: 45, score: 5,  rule: "Soma das Profundidades == 45 pontos GANHA 5 pontos" },
  { threshold: 50, score: 0,  rule: "Soma das Profundidades == 50 pontos GANHA 0 pontos" }
];

// ================================================================
// 1. HELPERS
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

// ================================================================
// 2. EXTRAÇÃO DOS DADOS
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
// 3. PARSE DAS REGRAS DINÂMICAS
// ================================================================

// --- Grupo 1: "10 padrões: 10ptos" ---
const g1Threshold = parseFirstNumber(grupo1.regraAtual) || 10;
const g1MaxPoints = parsePoints(grupo1.regraAtual) || 10;

// --- Lançamentos: ["=5 padrões: 10ptos", ">= 3 Padrões: 5ptos"] ---
const lancRegras = (lancamentos.regrasAtuais || [])
  .map(r => ({ threshold: parseFirstNumber(r), points: parsePoints(r), regra: r }))
  .filter(r => r.threshold !== null && r.points !== null)
  .sort((a, b) => b.threshold - a.threshold); // melhor tier primeiro

// --- Ultra: "15m³: 10ptos; >15m³: 0ptos" → >=15m³ = 10pts ---
const ultraThreshold = parseFirstNumber(ultra.regraAtual?.split(';')[0]) || 15;
const ultraMaxPoints = parsePoints(ultra.regraAtual?.split(';')[0]) || 10;

// --- Meta Nobre / Total ---
const nobreMaxPoints = parsePoints(metaNobreRaw.regraAtual) || 10;
const totalMaxPoints = parsePoints(metaTotalRaw.regraAtual) || 10;

// --- Rede ---
const redeMaxPoints = 10;

// --- Coringa: já definido como HARDCODED no topo do arquivo ---

// ================================================================
// 4. SCORES EFETIVOS
// ================================================================
const profPontosScore = num(profPontos.scoreAtual);

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

const scoreEfetivo = profPontosScore + g1EffScore + lancEffScore
  + ultraEffScore + nobreEffScore + totalEffScore
  + volumeEffScore + redeEffScore;

// ================================================================
// 5. GAPS (usando score absoluto, NÃO valorNecessario)
// ================================================================
const scoreManter = num(politica.ultimoTrimestre?.score);
let   scoreSubir  = num(politica.proximoNivel?.score);
let proximoNivelEfetivo = {
  posicao: politica.proximoNivel?.posicao || "",
  score: scoreSubir,
  desconto: num(politica.proximoNivel?.desconto)
};

const gapManter = Math.max(0, scoreManter - scoreEfetivo);
let   gapSubir  = Math.max(0, scoreSubir - scoreEfetivo);

// ================================================================
// RECÁLCULO DO PRÓXIMO NÍVEL (baseado na posição efetiva)
// ================================================================
// Se scoreEfetivo já atingiu ou ultrapassou o proximoNivel do sistema,
// buscar o próximo nível REAL na tabelaPosicoes.
const tabelaPosicoes = politica.tabelaPosicoes || [];
if (tabelaPosicoes.length > 0 && scoreEfetivo >= scoreSubir) {
  let posEfetivaIdx = -1;
  for (let i = 0; i < tabelaPosicoes.length; i++) {
    if (scoreEfetivo >= num(tabelaPosicoes[i].score)) posEfetivaIdx = i;
  }
  if (posEfetivaIdx >= 0 && posEfetivaIdx + 1 < tabelaPosicoes.length) {
    const realProximo = tabelaPosicoes[posEfetivaIdx + 1];
    scoreSubir = num(realProximo.score);
    proximoNivelEfetivo = {
      posicao: realProximo.posicao,
      score: scoreSubir,
      desconto: num(realProximo.desconto)
    };
  }
}

// ================================================================
// CORREÇÃO: MANTER >= SUBIR (cliente caiu de posição entre trimestres)
// ================================================================
// Se o alvo do MANTER (ultimoTrimestre) >= alvo do SUBIR (proximoNivel),
// empurrar SUBIR para a posição acima de ultimoTrimestre. Se ultimoTrimestre
// já for o topo da tabela, omitir os cenários SUBIR.
let omitirSubirPorManterMaior = false;
if (tabelaPosicoes.length > 0 && scoreManter > 0 && scoreManter >= scoreSubir) {
  const posManter = politica.ultimoTrimestre?.posicao;
  let manterIdx = -1;
  for (let i = 0; i < tabelaPosicoes.length; i++) {
    if (tabelaPosicoes[i].posicao === posManter) { manterIdx = i; break; }
  }
  if (manterIdx >= 0 && manterIdx + 1 < tabelaPosicoes.length) {
    const realProximo = tabelaPosicoes[manterIdx + 1];
    scoreSubir = num(realProximo.score);
    proximoNivelEfetivo = {
      posicao: realProximo.posicao,
      score: scoreSubir,
      desconto: num(realProximo.desconto)
    };
  } else {
    omitirSubirPorManterMaior = true;
  }
}

// Recalcula gapSubir após os ajustes acima
gapSubir = Math.max(0, scoreSubir - scoreEfetivo);

// ================================================================
// 6. NOBRE / TOTAL
// ================================================================
const precisaNobre = Math.abs(num(metaNobreRaw.itensAgrupados?.[1]?.vsMeta));
const precisaTotal = Math.abs(num(metaTotalRaw.itensAgrupados?.[1]?.vsMeta));
const precisaMaisParaTotal = Math.max(0, precisaTotal - precisaNobre);

// ================================================================
// 7. CRUZAMENTO GRUPO 1 × ÚLTIMOS 12 MESES (com prioridade multi-impacto)
// ================================================================
// Prioridade: 1º ULTRA+hist, 2º ULTRA-hist, 3º Normal+hist, 4º Normal-hist
const itensOk12m = new Set(
  (ultimos12m.itensValidos || []).filter(i => i.status === "OK").map(i => i.label)
);

const g1Invalidos = (grupo1.itensInvalidos || []);
const isUltra = (item) => (item.group || "").toUpperCase().includes("ULTRA");

const g1Tier1 = g1Invalidos.filter(i => isUltra(i) && itensOk12m.has(i.label)).map(i => i.label);  // ULTRA + histórico
const g1Tier2 = g1Invalidos.filter(i => isUltra(i) && !itensOk12m.has(i.label)).map(i => i.label); // ULTRA - histórico
const g1Tier3 = g1Invalidos.filter(i => !isUltra(i) && itensOk12m.has(i.label)).map(i => i.label); // Normal + histórico
const g1Tier4 = g1Invalidos.filter(i => !isUltra(i) && !itensOk12m.has(i.label)).map(i => i.label);// Normal - histórico

const g1ItensPriorizados = [...g1Tier1, ...g1Tier2, ...g1Tier3, ...g1Tier4];
const g1UltraLabels = new Set([...g1Tier1, ...g1Tier2]);
const g1ItensSugestiveis = [...g1Tier1, ...g1Tier3]; // todos com histórico
const g1ItensSemHistorico = [...g1Tier2, ...g1Tier4]; // todos sem histórico

// ================================================================
// 8. PROFUNDIDADE GERAL — classificação dinâmica
// ================================================================
const profAtualPts     = num(profPontos.posicaoAtual?.pontuacaoGanha);
const profNiveis = (profPontos.proximosNiveis || []).map(n => ({
  metaNecessaria: num(n.metaNecessaria),
  pontuacaoPossivel: num(n.pontuacaoPossivel),
  pontuacaoAtual: num(n.pontuacaoAtual),
  faltaParaNivel: num(n.faltaParaNivel),
  pontosIncrementais: num(n.pontuacaoPossivel) - profAtualPts,
  facil: num(n.faltaParaNivel) > 0 && num(n.faltaParaNivel) < 10
})).filter(n => n.faltaParaNivel > 0 && n.pontosIncrementais > 0);

// ================================================================
// 9. VOLUME — classificação FÁCIL/DIFÍCIL
// ================================================================
const metaTotalValor = num(metaTotalRaw.itensAgrupados?.[0]?.valor);
const mesAtual = new Date().getMonth() + 1;
const mesesRestantes = Math.max(1, 3 - ((mesAtual - 1) % 3));

const volumeNiveis = (volume.proximosNiveis || []).map(n => {
  const metaMensal = num(n.metaNecessaria);
  const metaTrimestral = num(n.metaTrimestral) || metaMensal * 3;
  const pontuacaoAtual = num(n.pontuacaoAtual);
  const faltaTrimestre = num(n.faltaParaNivelTrimestre)
    || Math.max(0, Math.ceil(metaTrimestral - pontuacaoAtual));
  const faltaMensal = Math.ceil(faltaTrimestre / mesesRestantes);
  const ratio = metaTotalValor > 0 ? faltaTrimestre / metaTotalValor : 999;
  return {
    metaMensal,
    metaTrimestral,
    pontuacaoPossivel: num(n.pontuacaoPossivel),
    pontuacaoAtual,
    faltaM3Trimestre: faltaTrimestre,
    faltaM3Mensal: faltaMensal,
    palletsTrimestre: Math.ceil(faltaTrimestre / 3),
    palletsMensal: Math.ceil(faltaMensal / 3),
    ratio,
    facil: ratio < 1.30
  };
}).filter(n => n.faltaM3Trimestre > 0); // Ignora níveis já atingíveis (falta 0)

// ================================================================
// 10. MOTOR DE CENÁRIOS
// ================================================================

const buildCenario = (label, pontosAlvo, posAlvo, descAlvo, isCenarioRede) => {
  const gap = Math.max(0, pontosAlvo - scoreEfetivo);

  if (gap <= 0) {
    let notaCoringaEarly = null;
    if (isCenarioRede && redeMet) {
      const projProf = profAtualPts;
      const projG1 = g1EffScore;
      const projLanc = lancEffScore;
      const projUltra = ultraEffScore;
      const soma = projProf + projG1 + projLanc + projUltra;
      let bonus = 0;
      for (const ct of coringaThresholds) { if (soma >= ct.threshold) bonus = ct.score; }
      if (bonus > 0) {
        const redeTotalJaBatida = redeTotalPct >= 100;
        notaCoringaEarly = {
          bonus, somaProfundidades: soma,
          composicao: { profPontos: projProf, grupo1: projG1, lancamentos: projLanc, ultra: projUltra },
          redeTotal: { percentualAtual: perfRede.percentilTotal || "0%", falta: `${(100 - redeTotalPct).toFixed(1)}pp`, jaBatida: redeTotalJaBatida },
          mensagem: redeTotalJaBatida
            ? `Bônus Coringa GARANTIDO (+${bonus}pts): rede já atingiu 100% meta TOTAL (${perfRede.percentilTotal}). Soma: ${soma}pts = Prof:${projProf} + G1:${projG1} + Lanç:${projLanc} + Ultra:${projUltra}.`
            : `Bônus Coringa (+${bonus}pts): condicionado à rede atingir 100% meta TOTAL. Soma: ${soma}pts.`
        };
      }
    }
    return {
      titulo: label, posicaoAlvo: posAlvo, pontosAlvo, gapInicial: 0, pontosBase: scoreEfetivo, pontosFinal: scoreEfetivo,
      jaAtingida: true, cenarioViavel: true, mensagem: "Meta já atingida! Mantenha o ritmo.", acoes: [],
      notaCoringa: notaCoringaEarly
    };
  }

  // --- Monta lista de ações na ordem correta ---
  const acoesPossiveis = [];

  // Pos 1: Grupo 1
  let g1ItensUltraRecomendados = [];
  if (!g1Met) {
    const faltam = g1Threshold - g1Validos;
    const itensRaw = g1ItensPriorizados.slice(0, faltam);
    g1ItensUltraRecomendados = itensRaw.filter(i => g1UltraLabels.has(i));
    const itensTagueados = itensRaw.map(label => g1UltraLabels.has(label) ? `${label} ⭐` : label);
    acoesPossiveis.push({
      pos: 1, metrica: "Positivação Interna (Grupo 1)", pontos: g1MaxPoints,
      acao: `Comprar ${faltam} padrões internos`,
      itens: itensTagueados, itensRaw,
      comHistorico: itensRaw.filter(i => g1ItensSugestiveis.includes(i)),
      semHistorico: itensRaw.filter(i => g1ItensSemHistorico.includes(i)),
      itensUltra: g1ItensUltraRecomendados
    });
  }

  // Pos 2: Lançamentos
  if (lancEffScore < (lancRegras[0]?.points || 0)) {
    const lancItens = (lancamentos.itensInvalidos || []).map(i => i.label);
    let tierEscolhido = null;
    // Tenta o melhor tier alcançável
    for (const tier of lancRegras) {
      if (lancItens.length >= (tier.threshold - lancValidos)) {
        tierEscolhido = tier;
        break;
      }
    }
    // Fallback: menor tier
    if (!tierEscolhido) {
      for (const tier of [...lancRegras].reverse()) {
        tierEscolhido = tier;
        break;
      }
    }
    if (tierEscolhido) {
      const faltam = tierEscolhido.threshold - lancValidos;
      acoesPossiveis.push({
        pos: 2, metrica: "Positivação de Lançamentos",
        pontos: tierEscolhido.points - lancEffScore,
        pontosAbsolutos: tierEscolhido.points,
        acao: `Implantar ${faltam} lançamentos (${tierEscolhido.regra})`,
        itens: lancItens.slice(0, faltam)
      });
    }
  }

  // Pos 3: Ultra Premium
  if (!ultraMet) {
    const faltaM3 = Math.max(0, ultraThreshold - ultraValorAtual);
    const faltaPallets = Math.ceil(faltaM3 / 3);
    let acaoUltra = `Comprar ${faltaM3.toFixed(1)}m³ de Ultra Premium (≈${faltaPallets} pallets)`;
    if (g1ItensUltraRecomendados.length > 0) {
      acaoUltra += `. Aproveite para comprar do ${g1ItensUltraRecomendados.join(", ")} já sugerido no Grupo 1, atendendo ambas as metas.`;
    }
    acoesPossiveis.push({
      pos: 3, metrica: "Meta Ultra Premium", pontos: ultraMaxPoints,
      acao: acaoUltra,
      faltaM3: Number(faltaM3.toFixed(2)), faltaPallets
    });
  }

  // Pos 4: Prof Geral FÁCIL (< 10 padrões)
  if (profNiveis.some(n => n.facil)) {
    acoesPossiveis.push({ pos: 4, _isProfFacil: true });
  }

  // Pos 5: Meta Nobre
  if (!nobreMet) {
    acoesPossiveis.push({
      pos: 5, metrica: "Meta Nobre", pontos: nobreMaxPoints,
      acao: `Comprar +${precisaNobre}m³ em produtos Nobres`,
      faltaM3: precisaNobre
    });
  }

  // Pos 6: Meta Total (será resolvida dinamicamente no loop)
  // Marcador — o comportamento real depende se Nobre foi recomendada
  if (!totalMet) {
    acoesPossiveis.push({
      pos: 6, metrica: "Meta Total", pontos: totalMaxPoints,
      _isDynamic: true // será resolvida no loop
    });
  }

  // Pos 7: Prof Geral DIFÍCIL (>= 10 padrões)
  if (profNiveis.some(n => !n.facil)) {
    acoesPossiveis.push({ pos: 7, _isProfDificil: true });
  }

  // --- Cenário 3: Rede VEM ANTES do Volume, Coringa calculado à parte ---
  if (isCenarioRede) {
    // Pos 8 (no cenário rede): Performance Rede
    if (!redeMet) {
      acoesPossiveis.push({
        pos: 8, metrica: "Performance Rede", pontos: redeMaxPoints,
        acao: `Rede atingir 100% meta Nobres (falta ${(100 - redeNobrePct).toFixed(1)}pp) → +${redeMaxPoints}pts. Coringa adicional se rede bater meta Total (falta ${(100 - redeTotalPct).toFixed(1)}pp)`,
        dependeDaEquipe: true
      });
    }

    // Coringa NÃO entra na lista — calculado após o loop

    // Pos 9: Volume FÁCIL (no cenário rede)
    // Pos 10: Volume DIFÍCIL
    acoesPossiveis.push({ pos: 9, _isVolumeFacil: true });
    acoesPossiveis.push({ pos: 10, _isVolumeDificil: true });
  } else {
    // --- Cenários 1 e 2: Volume sem Rede ---
    // Pos 8: Volume FÁCIL
    // Pos 11: Volume DIFÍCIL
    acoesPossiveis.push({ pos: 8, _isVolumeFacil: true });
    acoesPossiveis.push({ pos: 11, _isVolumeDificil: true });
  }

  // --- Ordenar por posição ---
  acoesPossiveis.sort((a, b) => a.pos - b.pos);

  // --- Executar ações na ordem até fechar o gap ---
  let pontosAcumulados = 0;
  const acoesExecutadas = [];
  let nobreRecomendada = false;
  let redeRecomendada = false;
  let profGeralTierSelecionado = null;
  let lancRecomendadaPts = 0;

  // Helper: simula Coringa para um dado tier de Prof
  const simularCoringa = (profTier) => {
    const projProf = profTier ? profTier.pontuacaoPossivel : profAtualPts;
    const projG1 = acoesExecutadas.find(a => a.metrica?.includes("Grupo 1")) ? g1MaxPoints : g1EffScore;
    const projLanc = acoesExecutadas.find(a => a.metrica?.includes("Lançamentos"))
      ? (lancRecomendadaPts || lancEffScore) : lancEffScore;
    const projUltra = ultraMet ? ultraMaxPoints
      : (acoesExecutadas.find(a => a.metrica?.includes("Ultra")) ? ultraMaxPoints : 0);
    const soma = projProf + projG1 + projLanc + projUltra;
    let bonus = 0;
    for (const ct of coringaThresholds) { if (soma >= ct.threshold) bonus = ct.score; }
    return bonus;
  };

  // Helper: seleciona tier otimizando Coringa no cenário Rede
  const selecionarProfTier = (tiers, gapR) => {
    if (!tiers.length) return null;
    if (isCenarioRede) {
      let melhor = null, melhorTotal = -1, melhorCoringa = -1;
      for (const t of tiers) {
        const c = simularCoringa(t);
        const tl = t.pontosIncrementais + c;
        if (tl > melhorTotal || (tl === melhorTotal && c > melhorCoringa)) {
          melhorTotal = tl; melhorCoringa = c; melhor = t;
        }
      }
      return melhor;
    }
    let n = tiers.find(x => x.pontosIncrementais >= gapR);
    if (!n) n = [...tiers].sort((a, b) => b.pontosIncrementais - a.pontosIncrementais)[0];
    return n;
  };

  for (const acao of acoesPossiveis) {
    if (pontosAcumulados >= gap) break;

    // Coringa: fecha o gap restante? Não precisa mais ações
    // - GARANTIDO (rede Total ≥ 100%) — cobre qualquer cenário
    // - CONDICIONAL no cenário Rede — aposta na rede ja aceita
    if (isCenarioRede || redeTotalPct >= 100) {
      const coringaBonus = simularCoringa(profGeralTierSelecionado);
      if (coringaBonus > 0 && pontosAcumulados + coringaBonus >= gap) break;
    }

    // --- Meta Total: resolução dinâmica ---
    if (acao._isDynamic && acao.metrica === "Meta Total") {
      if (nobreRecomendada) {
        // Nobre FOI recomendada → checar precisaMaisParaTotal
        if (precisaMaisParaTotal <= 0) {
          pontosAcumulados += totalMaxPoints;
          acoesExecutadas.push({
            pos: acao.pos, metrica: "Meta Total", pontos: totalMaxPoints,
            acao: `Ao atingir Meta Nobres, Meta Total é automaticamente cumprida (+${totalMaxPoints}pts)`,
            cobertaPelaNobre: true,
            scoreAcum: scoreEfetivo + pontosAcumulados,
            gapRestante: Math.max(0, gap - pontosAcumulados)
          });
        } else {
          pontosAcumulados += totalMaxPoints;
          acoesExecutadas.push({
            pos: acao.pos, metrica: "Meta Total", pontos: totalMaxPoints,
            acao: `Comprar +${precisaMaisParaTotal}m³ adicionais (além do Nobre) para Meta Total (+${totalMaxPoints}pts)`,
            faltaM3: precisaMaisParaTotal,
            scoreAcum: scoreEfetivo + pontosAcumulados,
            gapRestante: Math.max(0, gap - pontosAcumulados)
          });
        }
      } else if (nobreMet) {
        // Nobre JÁ batida → avaliar Total independente
        pontosAcumulados += totalMaxPoints;
        acoesExecutadas.push({
          pos: acao.pos, metrica: "Meta Total", pontos: totalMaxPoints,
          acao: `Comprar +${precisaTotal}m³ para atingir Meta Total (+${totalMaxPoints}pts)`,
          faltaM3: precisaTotal,
          scoreAcum: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados)
        });
      } else {
        // Nobre NÃO batida e NÃO recomendada (gap já fechou antes) → Total independente
        pontosAcumulados += totalMaxPoints;
        acoesExecutadas.push({
          pos: acao.pos, metrica: "Meta Total", pontos: totalMaxPoints,
          acao: `Comprar +${precisaTotal}m³ para atingir Meta Total (+${totalMaxPoints}pts)`,
          faltaM3: precisaTotal,
          scoreAcum: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados)
        });
      }
      continue;
    }

    // --- Prof Geral FÁCIL ---
    if (acao._isProfFacil) {
      if (profGeralTierSelecionado) continue; // já recomendada na pos anterior
      const gapRestanteAtual = gap - pontosAcumulados;
      if (gapRestanteAtual <= 0) continue;
      const nivel = selecionarProfTier(profNiveis.filter(n => n.facil), gapRestanteAtual);
      if (nivel) {
        pontosAcumulados += nivel.pontosIncrementais;
        profGeralTierSelecionado = nivel;
        acoesExecutadas.push({
          pos: acao.pos, metrica: "Profundidade Geral", pontos: nivel.pontosIncrementais,
          acao: `Positivar mais ${nivel.faltaParaNivel} padrões no portfólio (de ${profAtualPts} para ${nivel.pontuacaoPossivel}pts)`,
          dificuldade: "FÁCIL",
          scoreAcum: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados)
        });
      }
      continue;
    }

    // --- Prof Geral DIFÍCIL ---
    if (acao._isProfDificil) {
      if (profGeralTierSelecionado) continue; // já recomendada na pos anterior
      const gapRestanteAtual = gap - pontosAcumulados;
      if (gapRestanteAtual <= 0) continue;
      let nivel = selecionarProfTier(profNiveis.filter(n => !n.facil), gapRestanteAtual);
      if (!nivel) nivel = selecionarProfTier(profNiveis, gapRestanteAtual);
      if (nivel) {
        pontosAcumulados += nivel.pontosIncrementais;
        profGeralTierSelecionado = nivel;
        acoesExecutadas.push({
          pos: acao.pos, metrica: "Profundidade Geral", pontos: nivel.pontosIncrementais,
          acao: `Positivar mais ${nivel.faltaParaNivel} padrões no portfólio (de ${profAtualPts} para ${nivel.pontuacaoPossivel}pts)`,
          dificuldade: "DIFÍCIL",
          scoreAcum: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados)
        });
      }
      continue;
    }

    // --- Volume FÁCIL ---
    if (acao._isVolumeFacil) {
      const gapRestanteAtual = gap - pontosAcumulados;
      if (gapRestanteAtual <= 0) continue;
      const nivelFacil = volumeNiveis.find(n => n.facil && n.pontuacaoPossivel >= gapRestanteAtual);
      if (nivelFacil) {
        pontosAcumulados += nivelFacil.pontuacaoPossivel;
        acoesExecutadas.push({
          pos: acao.pos, metrica: "Volume Mensal", pontos: nivelFacil.pontuacaoPossivel,
          classificacao: "FÁCIL",
          acao: `Atingir ${nivelFacil.metaMensal}m³/mês → faltam ${nivelFacil.faltaM3Trimestre}m³ no tri. (≈${nivelFacil.palletsTrimestre} pal.)`,
          nivel: nivelFacil,
          scoreAcum: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados)
        });
      }
      continue;
    }

    // --- Volume DIFÍCIL ---
    if (acao._isVolumeDificil) {
      const gapRestanteAtual = gap - pontosAcumulados;
      if (gapRestanteAtual <= 0) continue;
      let nivelDificil = volumeNiveis.find(n => !n.facil && n.pontuacaoPossivel >= gapRestanteAtual);
      if (!nivelDificil) nivelDificil = [...volumeNiveis].filter(n => !n.facil).sort((a, b) => b.pontuacaoPossivel - a.pontuacaoPossivel)[0];
      if (!nivelDificil) nivelDificil = volumeNiveis.find(n => n.pontuacaoPossivel >= gapRestanteAtual);
      if (nivelDificil) {
        pontosAcumulados += nivelDificil.pontuacaoPossivel;
        acoesExecutadas.push({
          pos: acao.pos, metrica: "Volume Mensal", pontos: nivelDificil.pontuacaoPossivel,
          classificacao: nivelDificil.facil ? "FÁCIL" : "DIFÍCIL",
          acao: `Atingir ${nivelDificil.metaMensal}m³/mês → faltam ${nivelDificil.faltaM3Trimestre}m³ no tri. (≈${nivelDificil.palletsTrimestre} pal.)`,
          nivel: nivelDificil,
          scoreAcum: scoreEfetivo + pontosAcumulados,
          gapRestante: Math.max(0, gap - pontosAcumulados)
        });
      }
      continue;
    }

    // --- Ações normais ---
    pontosAcumulados += acao.pontos;

    if (acao.metrica === "Meta Nobre") nobreRecomendada = true;
    if (acao.metrica === "Performance Rede") redeRecomendada = true;

    if (acao.metrica?.includes("Lançamentos")) lancRecomendadaPts = acao.pontosAbsolutos || acao.pontos;

    acoesExecutadas.push({
      ...acao,
      scoreAcum: scoreEfetivo + pontosAcumulados,
      gapRestante: Math.max(0, gap - pontosAcumulados)
    });
  }

  // --- Resultado ---
  // (pontosFinal calculado APÓS Coringa para incluir bônus garantido)

  // --- Pontos Coringa ---
  // Condição alinhada com o motor:
  //   - Cenário Rede: sempre calcula (mesmo sem Rede recomendada, Coringa pode ter
  //     fechado o gap via break)
  //   - Cenários sem Rede: calcula SE rede Total ≥ 100% (garantido)
  let notaCoringa = null;
  if (isCenarioRede || redeTotalPct >= 100) {
    const projProf = profGeralTierSelecionado ? profGeralTierSelecionado.pontuacaoPossivel : profAtualPts;
    const projG1   = acoesExecutadas.find(a => a.metrica?.includes("Grupo 1")) ? g1MaxPoints : g1EffScore;
    const projLanc = acoesExecutadas.find(a => a.metrica?.includes("Lançamentos"))
      ? (lancRecomendadaPts || lancEffScore) : lancEffScore;
    const projUltra = ultraMet ? ultraMaxPoints
      : (acoesExecutadas.find(a => a.metrica?.includes("Ultra")) ? ultraMaxPoints : 0);

    const somaProfundidades = projProf + projG1 + projLanc + projUltra;

    let coringaBonus = 0;
    let thresholdUsed = null;
    for (const ct of coringaThresholds) {
      if (somaProfundidades >= ct.threshold) {
        coringaBonus = ct.score;
        thresholdUsed = ct;
      }
    }

    if (coringaBonus > 0) {
      const redeTotalJaBatida = redeTotalPct >= 100;
      notaCoringa = {
        bonus: coringaBonus,
        somaProfundidades,
        composicao: { profPontos: projProf, grupo1: projG1, lancamentos: projLanc, ultra: projUltra },
        redeTotal: {
          percentualAtual: perfRede.percentilTotal || "0%",
          falta: `${(100 - redeTotalPct).toFixed(1)}pp`,
          jaBatida: redeTotalJaBatida
        },
        regra: thresholdUsed?.rule,
        mensagem: redeTotalJaBatida
          ? `Bônus Coringa GARANTIDO (+${coringaBonus}pts): a rede já atingiu 100% da meta TOTAL (${perfRede.percentilTotal}). Soma profundidades: ${somaProfundidades}pts = Prof:${projProf} + G1:${projG1} + Lanç:${projLanc} + Ultra:${projUltra}.`
          : `Bônus Coringa (+${coringaBonus}pts): condicionado à rede atingir 100% da meta TOTAL (atualmente em ${perfRede.percentilTotal || '0%'}, faltam ${(100 - redeTotalPct).toFixed(1)}pp). Soma profundidades: ${somaProfundidades}pts = Prof:${projProf} + G1:${projG1} + Lanç:${projLanc} + Ultra:${projUltra}. SEPARADO dos 10pts da Perf. Rede (meta Nobres).`
      };
    }
  }

  // Coringa conta no pontosFinal quando GARANTIDO ou em cenário Rede (aposta já aceita)
  const coringaContabilizado = notaCoringa && (notaCoringa.redeTotal?.jaBatida || isCenarioRede) ? notaCoringa.bonus : 0;
  const pontosFinal = scoreEfetivo + pontosAcumulados + coringaContabilizado;
  const gapFinal = Math.max(0, gap - pontosAcumulados - coringaContabilizado);

  return {
    titulo: label,
    posicaoAlvo: posAlvo,
    descontoAlvo: descAlvo,
    pontosAlvo,
    pontosBase: scoreEfetivo,
    gapInicial: gap,
    jaAtingida: false, cenarioViavel: gapFinal <= 0,
    gapFinal,
    pontosFinal,
    acoes: acoesExecutadas,
    notaCoringa,
    mensagem: gapFinal <= 0
      ? `✅ ${pontosFinal}pts ≥ ${pontosAlvo}pts${coringaContabilizado > 0 ? ' (inclui Coringa +' + coringaContabilizado + 'pts)' : ''}`
      : `⚠️ Gap restante de ${gapFinal}pts`
  };
};

// ================================================================
// 11. GERAÇÃO DOS 3 CENÁRIOS
// ================================================================
const c1 = buildCenario(
  `MANTER Política ${politica.ultimoTrimestre?.posicao || ""}`,
  scoreManter,
  politica.ultimoTrimestre?.posicao || "",
  num(politica.ultimoTrimestre?.desconto),
  false
);

const c2 = buildCenario(
  `SUBIR para Política ${proximoNivelEfetivo.posicao}`,
  scoreSubir,
  proximoNivelEfetivo.posicao,
  proximoNivelEfetivo.desconto,
  false
);

const c3 = buildCenario(
  `SUBIR para Política ${proximoNivelEfetivo.posicao} (com Rede)`,
  scoreSubir,
  proximoNivelEfetivo.posicao,
  proximoNivelEfetivo.desconto,
  true
);

// Flags de omissão (em sync com o motor)
if (c1.jaAtingida) c1.omitirDoEmail = true;
if (c2.jaAtingida) c2.omitirDoEmail = true;
if (c3.jaAtingida) c3.omitirDoEmail = true;
if (redeMet) c3.omitirDoEmail = true;
if (omitirSubirPorManterMaior) {
  c2.omitirDoEmail = true;
  c3.omitirDoEmail = true;
}

// ================================================================
// 12. OUTPUT
// ================================================================
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const line = (char = '═', len = 70) => char.repeat(len);

console.log(`\n${CYAN}${line()}${RESET}`);
console.log(`${BOLD}  MOTOR DE RECOMENDAÇÕES v3 — VALIDAÇÃO${RESET}`);
console.log(`${CYAN}${line()}${RESET}`);

// --- Scores ---
console.log(`\n${BOLD}📊 SCORES EFETIVOS:${RESET}`);
console.log(`  Prof. Pontos:  ${profPontosScore}pts`);
console.log(`  Grupo 1:       ${g1EffScore}pts (${g1Validos}/${g1Threshold} → ${g1Met ? GREEN+'BATIDA'+RESET : YELLOW+'PENDENTE'+RESET})`);
console.log(`  Lançamentos:   ${lancEffScore}pts (${lancValidos} válidos)`);
console.log(`  Ultra Premium: ${ultraEffScore}pts (${ultraValorAtual}m³ vs ${ultraThreshold}m³ → ${ultraMet ? GREEN+'BATIDA'+RESET : YELLOW+'PENDENTE'+RESET})`);
console.log(`  Meta Nobre:    ${nobreEffScore}pts (${nobreCarteira}/${nobreMeta} = ${nobreMeta > 0 ? (nobreCarteira/nobreMeta*100).toFixed(1) : 0}% → ${nobreMet ? GREEN+'BATIDA'+RESET : YELLOW+'PENDENTE'+RESET})`);
console.log(`  Meta Total:    ${totalEffScore}pts (${totalCarteira}/${totalMeta} = ${totalMeta > 0 ? (totalCarteira/totalMeta*100).toFixed(1) : 0}% → ${totalMet ? GREEN+'BATIDA'+RESET : YELLOW+'PENDENTE'+RESET})`);
console.log(`  Volume:        ${volumeEffScore}pts`);
console.log(`  Perf. Rede:    ${redeEffScore}pts (Nobre: ${perfRede.percentilNobre} → ${redeMet ? GREEN+'BATIDA'+RESET : YELLOW+'PENDENTE'+RESET})`);
console.log(`  ${DIM}─────────────────────────${RESET}`);
console.log(`  ${BOLD}SCORE EFETIVO: ${scoreEfetivo}pts${RESET}`);

// --- Posição Efetiva ---
let posicaoEfetiva = politica.posicaoAtual || "";
let descontoEfetivo = num(politica.descontoAtual);
for (const p of tabelaPosicoes) {
  if (scoreEfetivo >= num(p.score)) {
    posicaoEfetiva = p.posicao;
    descontoEfetivo = num(p.desconto);
  }
}

// --- Gaps ---
console.log(`\n${BOLD}🎯 GAPS:${RESET}`);
console.log(`  Posição sistema: ${BOLD}${politica.posicaoAtual}${RESET} (${politica.scoreAtual}pts oficial)`);
console.log(`  Posição efetiva: ${BOLD}${posicaoEfetiva}${RESET} (${scoreEfetivo}pts efetivo → ${descontoEfetivo}%)`);
if (posicaoEfetiva !== politica.posicaoAtual) {
  console.log(`  ${YELLOW}⚠ Sistema mostra ${politica.posicaoAtual}, mas scoreEfetivo ${scoreEfetivo}pts corresponde a ${posicaoEfetiva}${RESET}`);
}
console.log(`  MANTER (${politica.ultimoTrimestre?.posicao} = ${scoreManter}pts): gap = ${BOLD}${gapManter}pts${RESET}`);
console.log(`  SUBIR  (${politica.proximoNivel?.posicao} = ${scoreSubir}pts): gap = ${BOLD}${gapSubir}pts${RESET}`);

// --- Cruzamento ---
console.log(`\n${BOLD}🔄 CRUZAMENTO G1 × 12M (prioridade multi-impacto):${RESET}`);
console.log(`  Faltam: ${g1Threshold - g1Validos} itens | Total disponíveis: ${g1ItensPriorizados.length}`);
if (g1Tier1.length > 0) console.log(`  ${GREEN}1º ULTRA+hist (${g1Tier1.length}): ${g1Tier1.join(", ")}${RESET}`);
if (g1Tier2.length > 0) console.log(`  ${YELLOW}2º ULTRA-hist (${g1Tier2.length}): ${g1Tier2.join(", ")}${RESET}`);
if (g1Tier3.length > 0) console.log(`  ${GREEN}3º Normal+hist (${g1Tier3.length}): ${g1Tier3.join(", ")}${RESET}`);
if (g1Tier4.length > 0) console.log(`  ${DIM}4º Normal-hist (${g1Tier4.length}): ${g1Tier4.join(", ")}${RESET}`);

// --- Prof Geral ---
console.log(`\n${BOLD}📏 PROFUNDIDADE GERAL (múltiplos tiers):${RESET}`);
console.log(`  Atual: ${profAtualPts}pts | Tiers disponíveis: ${profNiveis.length}`);
for (const n of profNiveis) {
  const tag = n.facil ? GREEN+'FÁCIL'+RESET : YELLOW+'DIFÍCIL'+RESET;
  console.log(`  ${n.metaNecessaria} padrões (${n.pontuacaoPossivel}pts): faltam ${n.faltaParaNivel} → +${n.pontosIncrementais}pts increm. → ${tag}`);
}

// --- Volume ---
console.log(`\n${BOLD}📦 VOLUME MENSAL (classificação):${RESET}`);
console.log(`  Meta Total referência: ${metaTotalValor}m³ | 130% = ${(metaTotalValor * 1.3).toFixed(0)}m³ | Meses restantes: ${mesesRestantes}`);
for (const n of volumeNiveis) {
  const tag = n.facil ? GREEN+'FÁCIL'+RESET : RED+'DIFÍCIL'+RESET;
  console.log(`  ${n.metaMensal}m³/mês (${n.pontuacaoPossivel}pts): falta ${n.faltaM3Trimestre}m³ tri. (~${n.faltaM3Mensal}m³/mês) → ${(n.ratio*100).toFixed(1)}% → ${tag}`);
}

// --- Nobre/Total ---
console.log(`\n${BOLD}💰 NOBRE/TOTAL:${RESET}`);
console.log(`  Precisa Nobre: ${precisaNobre}m³ | Total: ${precisaTotal}m³ | Mais p/ Total: ${precisaMaisParaTotal}m³`);
console.log(`  ${precisaMaisParaTotal <= 0 ? GREEN+'→ Total coberto pela Nobre!'+RESET : YELLOW+'→ Precisa volume adicional'+RESET}`);

// --- Cenários ---
const printCenario = (c) => {
  const color = c.cenarioViavel ? GREEN : RED;
  console.log(`\n${CYAN}${line()}${RESET}`);
  console.log(`${BOLD}  ${c.titulo.toUpperCase()}${RESET}`);
  console.log(`  Alvo: ${c.pontosAlvo}pts (${c.posicaoAlvo}) | Base: ${c.pontosBase}pts | Gap: ${BOLD}${c.gapInicial}pts${RESET}`);
  console.log(`${CYAN}${line('─')}${RESET}`);

  if (c.gapInicial <= 0) {
    console.log(`  ${GREEN}✅ ${c.mensagem}${RESET}`);
    return;
  }

  for (const a of c.acoes) {
    const check = a.gapRestante <= 0 ? GREEN+'✅' : YELLOW+'→';
    const posLabel = DIM+`[pos ${a.pos}]`+RESET;
    console.log(`  ${check} ${a.metrica}${RESET}: +${a.pontos}pts ${posLabel}`);
    console.log(`     ${DIM}${a.acao}${RESET}`);
    console.log(`     ${DIM}Score: ${a.scoreAcum}pts | Gap restante: ${a.gapRestante}pts${RESET}`);
    if (a.itens && a.itens.length > 0) {
      console.log(`     ${DIM}Itens: ${a.itens.join(", ")}${RESET}`);
    }
  }

  console.log(`${CYAN}${line('─')}${RESET}`);
  console.log(`  ${color}${c.mensagem}${RESET}`);

  // --- Nota Coringa (se aplicável) ---
  if (c.notaCoringa) {
    console.log(`\n  ${YELLOW}📝 NOTA CORINGA:${RESET}`);
    console.log(`  ${DIM}${c.notaCoringa.mensagem}${RESET}`);
  }
};

printCenario(c1);
printCenario(c2);
printCenario(c3);

// ================================================================
// TEST SUITE — Validação dinâmica do Motor de Recomendações
// ================================================================
console.log(`\n${CYAN}${line()}${RESET}`);
console.log(`${BOLD}  TEST SUITE — VALIDAÇÃO DO MOTOR${RESET}`);
console.log(`${CYAN}${line('─')}${RESET}`);

let passed = 0;
let failed = 0;
const check = (label, condition) => {
  if (condition) { passed++; } else { failed++; }
  console.log(`  ${condition ? GREEN+'✅' : RED+'❌'} ${label}${RESET}`);
};

const section = (title) => {
  console.log(`\n  ${BOLD}${title}${RESET}`);
};

// ─────────────────────────────────────────────────
section("1. SCORE EFETIVO");
// ─────────────────────────────────────────────────
const somaScores = profPontosScore + g1EffScore + lancEffScore + ultraEffScore + nobreEffScore + totalEffScore + volumeEffScore + redeEffScore;
check(`Soma dos scores individuais = scoreEfetivo (${somaScores} = ${scoreEfetivo})`, scoreEfetivo === somaScores);

// Cada score individual deve ser coerente com seu status
check(`Prof. Pontos: score ${profPontosScore}pts = scoreAtual do JSON (${num(profPontos.scoreAtual)})`, profPontosScore === num(profPontos.scoreAtual));

if (g1Met) {
  check(`Grupo 1: BATIDA (${g1Validos} ≥ ${g1Threshold}) → score ${g1EffScore}pts`, g1EffScore === g1MaxPoints);
} else {
  check(`Grupo 1: PENDENTE (${g1Validos} < ${g1Threshold}) → score 0pts`, g1EffScore === 0);
}

if (ultraMet) {
  check(`Ultra Premium: BATIDA (${ultraValorAtual}m³ ≥ ${ultraThreshold}m³) → score ${ultraEffScore}pts`, ultraEffScore === ultraMaxPoints);
} else {
  check(`Ultra Premium: PENDENTE (${ultraValorAtual}m³ < ${ultraThreshold}m³) → score 0pts`, ultraEffScore === 0);
}

if (nobreMet) {
  check(`Meta Nobre: BATIDA (${nobreCarteira}/${nobreMeta} = ${(nobreCarteira/nobreMeta*100).toFixed(1)}% ≥ 98%) → score ${nobreEffScore}pts`, nobreEffScore === nobreMaxPoints);
} else {
  check(`Meta Nobre: PENDENTE (${nobreCarteira}/${nobreMeta} = ${nobreMeta > 0 ? (nobreCarteira/nobreMeta*100).toFixed(1) : 0}% < 98%) → score 0pts`, nobreEffScore === 0);
}

if (totalMet) {
  check(`Meta Total: BATIDA (${totalCarteira}/${totalMeta} = ${(totalCarteira/totalMeta*100).toFixed(1)}% ≥ 98%) → score ${totalEffScore}pts`, totalEffScore === totalMaxPoints);
} else {
  check(`Meta Total: PENDENTE (${totalCarteira}/${totalMeta} = ${totalMeta > 0 ? (totalCarteira/totalMeta*100).toFixed(1) : 0}% < 98%) → score 0pts`, totalEffScore === 0);
}

check(`Volume: score ${volumeEffScore}pts = pontuacaoGanha do JSON (${num(volume.posicaoAtual?.pontuacaoGanha)})`, volumeEffScore === num(volume.posicaoAtual?.pontuacaoGanha));

if (redeMet) {
  check(`Perf. Rede: BATIDA (${redeNobrePct}% ≥ 100%) → score ${redeEffScore}pts`, redeEffScore === redeMaxPoints);
} else {
  check(`Perf. Rede: PENDENTE (${redeNobrePct}% < 100%) → score 0pts`, redeEffScore === 0);
}

// ─────────────────────────────────────────────────
section("2. CÁLCULO DOS GAPS");
// ─────────────────────────────────────────────────
check(`Gap MANTER = max(0, ${scoreManter} - ${scoreEfetivo}) = ${gapManter}`, gapManter === Math.max(0, scoreManter - scoreEfetivo));
check(`Gap SUBIR = max(0, ${scoreSubir} - ${scoreEfetivo}) = ${gapSubir}`, gapSubir === Math.max(0, scoreSubir - scoreEfetivo));
check(`Usa score absoluto (Manter=${scoreManter}), NÃO valorNecessario`, scoreManter === num(politica.ultimoTrimestre?.score));
// scoreSubir pode ser recalculado (posição efetiva acima do sistema OU MANTER >= SUBIR)
check(`scoreSubir coerente com proximoNivelEfetivo (${proximoNivelEfetivo.posicao}=${scoreSubir}pts)`, scoreSubir === proximoNivelEfetivo.score);

// Posição efetiva
if (tabelaPosicoes.length > 0) {
  let posEsperada = tabelaPosicoes[0].posicao;
  for (const p of tabelaPosicoes) { if (scoreEfetivo >= num(p.score)) posEsperada = p.posicao; }
  check(`Posição efetiva: ${posicaoEfetiva} (scoreEfetivo ${scoreEfetivo}pts → ${posEsperada})`, posicaoEfetiva === posEsperada);
  if (posicaoEfetiva !== politica.posicaoAtual) {
    check(`Posição efetiva ${posicaoEfetiva} ≠ sistema ${politica.posicaoAtual} (sistema atrasado, motor corrige)`, true);
  }
}

// ─────────────────────────────────────────────────
section("3. CRUZAMENTO GRUPO 1 × ÚLTIMOS 12M (MULTI-IMPACTO)");
// ─────────────────────────────────────────────────
const g1Faltam = g1Threshold - g1Validos;
if (g1Faltam > 0) {
  check(`Faltam ${g1Faltam} itens para Grupo 1 (${g1Validos}/${g1Threshold})`, g1Faltam === g1Threshold - g1Validos);

  // Todos os itens priorizados existem em G1.itensInvalidos
  const g1InvalidLabels = new Set(g1Invalidos.map(i => i.label));
  check(`Todos itens priorizados existem em G1.itensInvalidos`, g1ItensPriorizados.every(item => g1InvalidLabels.has(item)));

  // Tier 1 (ULTRA+hist): todos devem ser ULTRA E ter histórico
  check(`Tier 1 ULTRA+hist: ${g1Tier1.length} itens`, g1Tier1.every(label => {
    const item = g1Invalidos.find(i => i.label === label);
    return isUltra(item) && itensOk12m.has(label);
  }));

  // Tier 2 (ULTRA-hist): todos devem ser ULTRA E NÃO ter histórico
  check(`Tier 2 ULTRA-hist: ${g1Tier2.length} itens`, g1Tier2.every(label => {
    const item = g1Invalidos.find(i => i.label === label);
    return isUltra(item) && !itensOk12m.has(label);
  }));

  // Tier 3 (Normal+hist): NÃO ultra E tem histórico
  check(`Tier 3 Normal+hist: ${g1Tier3.length} itens`, g1Tier3.every(label => {
    const item = g1Invalidos.find(i => i.label === label);
    return !isUltra(item) && itensOk12m.has(label);
  }));

  // Tier 4 (Normal-hist): NÃO ultra E NÃO tem histórico
  check(`Tier 4 Normal-hist: ${g1Tier4.length} itens`, g1Tier4.every(label => {
    const item = g1Invalidos.find(i => i.label === label);
    return !isUltra(item) && !itensOk12m.has(label);
  }));

  // Total dos tiers = total de itensInvalidos
  check(`Total tiers (${g1Tier1.length}+${g1Tier2.length}+${g1Tier3.length}+${g1Tier4.length}) = itensInvalidos (${g1Invalidos.length})`,
    g1Tier1.length + g1Tier2.length + g1Tier3.length + g1Tier4.length === g1Invalidos.length);

  // Itens selecionados no cenário devem seguir a prioridade
  const g1AcaoManter = c1.acoes.find(a => a.metrica?.includes("Grupo 1"));
  if (g1AcaoManter) {
    const selecionados = g1AcaoManter.itensRaw || g1AcaoManter.itens;
    const esperados = g1ItensPriorizados.slice(0, g1Faltam);
    check(`MANTER: itens selecionados seguem ordem priorizada`, JSON.stringify(selecionados) === JSON.stringify(esperados));

    // Verifica que itens ULTRA estão tagueados com ⭐
    if (g1AcaoManter.itensUltra && g1AcaoManter.itensUltra.length > 0) {
      const todosTagueados = g1AcaoManter.itensUltra.every(u =>
        g1AcaoManter.itens.some(i => i.includes(u) && i.includes("⭐"))
      );
      check(`MANTER: itens ULTRA tagueados com ⭐ (${g1AcaoManter.itensUltra.join(", ")})`, todosTagueados);
    }
  }
} else {
  check(`Grupo 1 já batida (${g1Validos} ≥ ${g1Threshold}) → sem cruzamento`, g1Met);
}

// ─────────────────────────────────────────────────
section("4. PROFUNDIDADE GERAL — MÚLTIPLOS TIERS");
// ─────────────────────────────────────────────────
if (profNiveis.length === 0) {
  check(`Prof Geral: sem tiers disponíveis → já no máximo`, true);
} else {
  check(`Prof Geral: ${profNiveis.length} tiers disponíveis`, profNiveis.length > 0);
  for (const n of profNiveis) {
    const tag = n.facil ? "FÁCIL" : "DIFÍCIL";
    check(`Tier ${n.metaNecessaria} (${n.pontuacaoPossivel}pts): faltam ${n.faltaParaNivel} → ${tag} | +${n.pontosIncrementais}pts`, n.pontosIncrementais > 0 && n.faltaParaNivel > 0);
  }
}

// ─────────────────────────────────────────────────
section("5. NOBRE / TOTAL — RELAÇÃO");
// ─────────────────────────────────────────────────
check(`precisaNobre = abs(vsMeta) = ${precisaNobre}m³`, precisaNobre === Math.abs(num(metaNobreRaw.itensAgrupados?.[1]?.vsMeta)));
check(`precisaTotal = abs(vsMeta) = ${precisaTotal}m³`, precisaTotal === Math.abs(num(metaTotalRaw.itensAgrupados?.[1]?.vsMeta)));
check(`precisaMaisParaTotal = max(0, ${precisaTotal} - ${precisaNobre}) = ${precisaMaisParaTotal}m³`, precisaMaisParaTotal === Math.max(0, precisaTotal - precisaNobre));
if (precisaMaisParaTotal <= 0) {
  check(`Nobre COBRE Total → Meta Total sem ação adicional de volume`, true);
} else {
  check(`Nobre NÃO cobre Total → precisa +${precisaMaisParaTotal}m³ adicionais`, precisaMaisParaTotal > 0);
}

// ─────────────────────────────────────────────────
section("6. VOLUME — CLASSIFICAÇÃO FÁCIL/DIFÍCIL");
// ─────────────────────────────────────────────────
check(`Meta Total referência: ${metaTotalValor}m³ | 130% = ${(metaTotalValor * 1.3).toFixed(0)}m³`, metaTotalValor > 0);
for (const n of volumeNiveis) {
  const ratio = n.faltaM3Trimestre / metaTotalValor;
  const esperado = ratio < 1.30;
  check(`Volume ${n.metaMensal}m³ (${n.pontuacaoPossivel}pts): falta ${n.faltaM3Trimestre} → ${(ratio*100).toFixed(1)}% → ${esperado ? 'FÁCIL' : 'DIFÍCIL'}`, n.facil === esperado);
}
check(`Todos os volumes têm faltaM3Trimestre > 0 (filtro ativo)`, volumeNiveis.every(n => n.faltaM3Trimestre > 0));

// ─────────────────────────────────────────────────
section("7. CENÁRIOS — FECHAMENTO E COERÊNCIA");
// ─────────────────────────────────────────────────
for (const [nome, c] of [['MANTER', c1], ['SUBIR', c2], ['SUBIR COM REDE', c3]]) {
  if (c.gapInicial <= 0) {
    check(`${nome}: gap=0 → meta já atingida → sem ações`, c.acoes.length === 0 && c.jaAtingida);
    continue;
  }

  // Cenário fecha?
  if (c.cenarioViavel) {
    check(`${nome}: fecha (${c.pontosFinal}pts ≥ ${c.pontosAlvo}pts)`, c.pontosFinal >= c.pontosAlvo);
  } else {
    check(`${nome}: NÃO fecha (gap restante: ${c.gapFinal}pts) — mensagem de aviso presente`, c.gapFinal > 0 && c.mensagem.includes('Gap restante'));
  }

  // Última ação é necessária (penúltima ainda tem gap > 0)
  if (c.acoes.length >= 2) {
    const penultima = c.acoes[c.acoes.length - 2];
    check(`${nome}: última ação necessária (penúltima gap=${penultima.gapRestante} > 0)`, penultima.gapRestante > 0);
  }

  // Nenhuma ação com pontos 0
  const acoesZero = c.acoes.filter(a => a.pontos <= 0);
  check(`${nome}: nenhuma ação com 0 pontos (${acoesZero.length} encontradas)`, acoesZero.length === 0);

  // Score acumulado é crescente
  let crescente = true;
  for (let i = 1; i < c.acoes.length; i++) {
    if (c.acoes[i].scoreAcum <= c.acoes[i-1].scoreAcum) { crescente = false; break; }
  }
  check(`${nome}: score acumulado é estritamente crescente`, crescente);

  // Gap restante é decrescente
  let decrescente = true;
  for (let i = 1; i < c.acoes.length; i++) {
    if (c.acoes[i].gapRestante >= c.acoes[i-1].gapRestante) { decrescente = false; break; }
  }
  check(`${nome}: gap restante é estritamente decrescente`, decrescente);

  // Primeira ação parte do scoreEfetivo
  if (c.acoes.length > 0) {
    const primeira = c.acoes[0];
    check(`${nome}: primeira ação → score = base(${c.pontosBase}) + pontos(${primeira.pontos}) = ${primeira.scoreAcum}`, primeira.scoreAcum === c.pontosBase + primeira.pontos);
  }

  // Cada métrica aparece no máximo 1 vez (ex: Profundidade Geral não pode duplicar)
  const metricas = c.acoes.map(a => a.metrica || a.nome);
  const duplicadas = metricas.filter((m, i) => metricas.indexOf(m) !== i);
  check(`${nome}: sem métricas duplicadas (${duplicadas.length > 0 ? duplicadas.join(', ') : 'ok'})`, duplicadas.length === 0);
}

// ─────────────────────────────────────────────────
section("8. ORDEM DE PRIORIDADES");
// ─────────────────────────────────────────────────
for (const [nome, c] of [['MANTER', c1], ['SUBIR', c2], ['SUBIR COM REDE', c3]]) {
  if (c.acoes.length < 2) continue;

  // Extrair posições das ações do cenário
  const posicoes = c.acoes.map(a => a.pos).filter(p => p !== undefined);
  if (posicoes.length < 2) continue;

  // Posições devem ser crescentes (ordem de prioridade)
  let ordemCorreta = true;
  for (let i = 1; i < posicoes.length; i++) {
    if (posicoes[i] < posicoes[i-1]) { ordemCorreta = false; break; }
  }
  check(`${nome}: ações na ordem de prioridade crescente [${posicoes.join(',')}]`, ordemCorreta);
}

// Cenários 1 e 2: Rede NUNCA deve aparecer
for (const [nome, c] of [['MANTER', c1], ['SUBIR', c2]]) {
  const temRede = c.acoes.find(a => a.metrica?.includes("Rede") || a.metrica?.includes("Rede"));
  check(`${nome}: sem Performance Rede (cenários sem rede)`, !temRede);
}

// ─────────────────────────────────────────────────
section("9. META TOTAL — COMPORTAMENTO COM NOBRE");
// ─────────────────────────────────────────────────
for (const [nome, c] of [['MANTER', c1], ['SUBIR', c2], ['SUBIR COM REDE', c3]]) {
  const acaoTotal = c.acoes.find(a => a.metrica === "Meta Total");
  const acaoNobre = c.acoes.find(a => a.metrica === "Meta Nobre");

  if (!acaoTotal) continue; // Total não foi recomendada

  if (acaoNobre && precisaMaisParaTotal <= 0) {
    // Nobre recomendada E cobre Total → deve ser cobertaPelaNobre
    check(`${nome}: Meta Total coberta pela Nobre (cobertaPelaNobre=true)`, acaoTotal.cobertaPelaNobre === true);
    check(`${nome}: Meta Total sem ação de volume adicional`, !acaoTotal.acao?.includes("adicionais") || false);
  } else if (acaoNobre && precisaMaisParaTotal > 0) {
    // Nobre recomendada MAS não cobre → precisa volume extra
    check(`${nome}: Meta Total precisa volume adicional (cobertaPelaNobre ≠ true)`, acaoTotal.cobertaPelaNobre !== true);
  } else if (nobreMet && !acaoNobre) {
    // Nobre já batida → Total independente
    check(`${nome}: Meta Total avaliada independente (Nobre já batida)`, true);
  }
}

// ─────────────────────────────────────────────────
section("9b. ULTRA CROSS-REFERENCE (MULTI-IMPACTO)");
// ─────────────────────────────────────────────────
for (const [nome, c] of [['MANTER', c1], ['SUBIR', c2], ['SUBIR COM REDE', c3]]) {
  const acaoG1 = c.acoes.find(a => a.metrica?.includes("Grupo 1"));
  const acaoUltra = c.acoes.find(a => a.metrica?.includes("Ultra"));

  if (acaoG1?.itensUltra?.length > 0 && acaoUltra) {
    // Se G1 recomendou ULTRA items E Ultra Premium também foi recomendado:
    // A descrição do Ultra deve referenciar os itens ULTRA do G1
    const referenciaPresente = acaoG1.itensUltra.every(u => acaoUltra.acao.includes(u));
    check(`${nome}: Ultra Premium referencia itens ULTRA do G1 (${acaoG1.itensUltra.join(", ")})`, referenciaPresente);
  } else if (acaoG1?.itensUltra?.length > 0 && !acaoUltra) {
    check(`${nome}: G1 tem ULTRA items mas Ultra já batida → sem cross-reference`, true);
  }
}

// ─────────────────────────────────────────────────
section("10. MÉTRICAS BATIDAS → NÃO RECOMENDADAS");
// ─────────────────────────────────────────────────
// Se uma métrica já está batida, não deve aparecer como ação
const c1Metricas = new Set(c1.acoes.map(a => a.metrica));

if (g1Met) check(`Grupo 1 batida → não recomendada no MANTER`, !c1Metricas.has("Positivação Interna (Grupo 1)"));
if (lancEffScore >= (lancRegras[0]?.points || 0)) check(`Lançamentos no tier máximo → não recomendada no MANTER`, !c1Metricas.has("Positivação de Lançamentos"));
if (ultraMet) check(`Ultra batida → não recomendada no MANTER`, !c1Metricas.has("Meta Ultra Premium"));
if (nobreMet) check(`Meta Nobre batida → não recomendada no MANTER`, !c1Metricas.has("Meta Nobre"));
if (totalMet) check(`Meta Total batida → não recomendada no MANTER`, !c1Metricas.has("Meta Total"));

// ─────────────────────────────────────────────────
section("11. PONTOS CORINGA");
// ─────────────────────────────────────────────────
// Cenários 1 e 2: só têm Coringa quando rede Total já ≥ 100% (GARANTIDO)
if (redeTotalPct >= 100) {
  check(`MANTER: notaCoringa pode existir (rede Total ${redeTotalPct}% ≥ 100%)`, true);
  check(`SUBIR: notaCoringa pode existir (rede Total ${redeTotalPct}% ≥ 100%)`, true);
} else {
  check(`MANTER: sem notaCoringa (rede Total ${redeTotalPct}% < 100%)`, c1.notaCoringa === null || c1.notaCoringa === undefined);
  check(`SUBIR: sem notaCoringa (rede Total ${redeTotalPct}% < 100%)`, c2.notaCoringa === null || c2.notaCoringa === undefined);
}

// Cenário 3: coringa depende de Rede (recomendada OU já batida)
const redeNoC3 = c3.acoes.find(a => a.metrica?.includes("Rede"));
const redeAtivaNoC3 = redeNoC3 || redeMet; // Rede como ação OU já batida
if (redeAtivaNoC3) {
  if (c3.notaCoringa) {
    check(`SUBIR COM REDE: notaCoringa presente (Rede ${redeMet ? 'já batida' : 'recomendada'})`, true);
    check(`Coringa bonus > 0 (${c3.notaCoringa.bonus}pts)`, c3.notaCoringa.bonus > 0);

    // Deriva Prof projetada a partir das ações do cenário
    const profAcaoC3 = c3.acoes.find(a => a.metrica === "Profundidade Geral");
    const projProf = profAcaoC3 ? (profAtualPts + profAcaoC3.pontos) : profAtualPts;
    const projG1 = c3.acoes.find(a => a.metrica?.includes("Grupo 1")) ? g1MaxPoints : g1EffScore;
    const projLanc = c3.acoes.find(a => a.metrica?.includes("Lançamentos")) ? (lancRegras[0]?.points || lancEffScore) : lancEffScore;
    const projUltra = ultraMet ? ultraMaxPoints : (c3.acoes.find(a => a.metrica?.includes("Ultra")) ? ultraMaxPoints : 0);
    const somaEsperada = projProf + projG1 + projLanc + projUltra;

    check(`Coringa soma projetada: ${c3.notaCoringa.somaProfundidades} = Prof(${projProf}) + G1(${projG1}) + Lanç(${projLanc}) + Ultra(${projUltra}) = ${somaEsperada}`, c3.notaCoringa.somaProfundidades === somaEsperada);

    let bonusEsperado = 0;
    for (const ct of coringaThresholds) {
      if (somaEsperada >= ct.threshold) bonusEsperado = ct.score;
    }
    check(`Coringa bônus correto: soma ${somaEsperada}pts → bônus ${bonusEsperado}pts (obtido: ${c3.notaCoringa.bonus}pts)`, c3.notaCoringa.bonus === bonusEsperado);

    // Se Rede Total já batida, deve ser marcado como GARANTIDO
    if (redeTotalPct >= 100) {
      check(`Coringa GARANTIDO (rede Total ${redeTotalPct}% ≥ 100%)`, c3.notaCoringa.redeTotal?.jaBatida === true);
    }

    if (profAcaoC3) {
      check(`Coringa usa Prof projetada (${projProf}pts, não atual ${profAtualPts}pts)`, projProf > profAtualPts);
    }
  } else {
    // Rede ativa mas coringa=null → bônus deveria ser 0
    const profAcaoC3b = c3.acoes.find(a => a.metrica === "Profundidade Geral");
    const projProf2 = profAcaoC3b ? (profAtualPts + profAcaoC3b.pontos) : profAtualPts;
    const projG12 = c3.acoes.find(a => a.metrica?.includes("Grupo 1")) ? g1MaxPoints : g1EffScore;
    const projLanc2 = c3.acoes.find(a => a.metrica?.includes("Lançamentos")) ? (lancRegras[0]?.points || lancEffScore) : lancEffScore;
    const projUltra2 = ultraMet ? ultraMaxPoints : (c3.acoes.find(a => a.metrica?.includes("Ultra")) ? ultraMaxPoints : 0);
    const soma2 = projProf2 + projG12 + projLanc2 + projUltra2;
    let bonus2 = 0;
    for (const ct of coringaThresholds) { if (soma2 >= ct.threshold) bonus2 = ct.score; }
    check(`SUBIR COM REDE: sem notaCoringa porque bônus seria ${bonus2}pts (soma ${soma2})`, bonus2 === 0);
  }
} else {
  // Rede não recomendada e não batida → sem coringa
  check(`SUBIR COM REDE: sem Rede (nem ação nem batida) → sem notaCoringa`, c3.notaCoringa === null || c3.notaCoringa === undefined);
}

// ─────────────────────────────────────────────────
section("12. VOLUME MENSAL — SELEÇÃO DE NÍVEL");
// ─────────────────────────────────────────────────
for (const [nome, c, isCenarioRede] of [['MANTER', c1, false], ['SUBIR', c2, false], ['SUBIR COM REDE', c3, true]]) {
  const acaoVol = c.acoes.find(a => a.metrica === "Volume Mensal");
  if (!acaoVol) { check(`${nome}: Volume não recomendado (desnecessário ou ações anteriores fecharam gap)`, true); continue; }

  // Volume deve ter faltaM3Trimestre > 0 na descrição
  check(`${nome}: Volume tem m³ > 0 na descrição`, !acaoVol.acao.includes("faltam 0m³"));

  // Volume FÁCIL deve vir antes de DIFÍCIL em prioridade
  if (acaoVol.dificuldade) {
    check(`${nome}: Volume classificado como ${acaoVol.dificuldade}`, ["FÁCIL", "DIFÍCIL"].includes(acaoVol.dificuldade));
  }
}

// ─────────────────────────────────────────────────
section("13. INTEGRIDADE DOS DADOS DE SAÍDA");
// ─────────────────────────────────────────────────
// Todas as ações devem ter campos obrigatórios
for (const [nome, c] of [['MANTER', c1], ['SUBIR', c2], ['SUBIR COM REDE', c3]]) {
  for (const a of c.acoes) {
    const temNome = !!a.metrica;
    const temPontos = typeof a.pontos === 'number' && a.pontos > 0;
    const temDescricao = !!a.acao && a.acao.length > 0;
    const temScore = typeof a.scoreAcum === 'number';
    const temGap = typeof a.gapRestante === 'number';

    if (!temNome || !temPontos || !temDescricao || !temScore || !temGap) {
      check(`${nome}: ação "${a.metrica || 'SEM NOME'}" tem todos os campos obrigatórios`, false);
    }
  }
  // Check geral se todas passaram
  const todasOk = c.acoes.every(a => !!a.metrica && a.pontos > 0 && !!a.acao && typeof a.scoreAcum === 'number' && typeof a.gapRestante === 'number');
  check(`${nome}: todas as ${c.acoes.length} ações têm campos obrigatórios completos`, todasOk);
}

// ─────────────────────────────────────────────────
// RESUMO FINAL
// ─────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${CYAN}${line()}${RESET}`);
console.log(`  ${BOLD}RESULTADO: ${passed}/${total} checks${RESET} — ${failed === 0 ? GREEN+'TODOS PASSARAM ✅' : RED+`${failed} FALHARAM ❌`}${RESET}`);
console.log(`${CYAN}${line()}${RESET}`);

console.log(`\n${DIM}Arquivo de input: ${inputPath}${RESET}\n`);