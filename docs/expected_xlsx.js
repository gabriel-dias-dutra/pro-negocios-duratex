// ================================================================
// expected_xlsx.js
// ================================================================
// Extrai as expectativas do cliente da aba "Regras Atuais" do XLSX.
// Notação de pontos: INCREMENTAL (Decisão A1 — motor usa incremental).
// Quando o cliente escreveu tier absoluto, convertemos para incremental
// considerando o score atual da métrica do parceiro.
//
// Tipos possíveis por cenário:
//   { tipo: "ok" }             — XLSX diz "OK" → motor pode ter qualquer ação
//   { tipo: "x" }              — XLSX diz "X" → cenário omitido
//   { tipo: "excessao" }       — XLSX diz "Excessão" → cenário omitido
//   { tipo: "retirar" }        — XLSX diz "Retirar" → cenário omitido
//   { tipo: "correcao", acoes: [...] }  — XLSX lista ações esperadas
// ================================================================

// Helper: cria entrada de ação esperada
const acao = (nome, pontos) => ({ nome, pontos });

// Nome canônico → expectativas (manter, subirIndividual, subirComRede)
module.exports = {
  // ============== Lojas em EXCEÇÃO ==============
  "Madtex (Lavras)":      { manter: { tipo: "excessao" }, subirIndividual: { tipo: "excessao" }, subirComRede: { tipo: "excessao" } },
  "Casa do MDF (Agenceslau)": { manter: { tipo: "excessao" }, subirIndividual: { tipo: "excessao" }, subirComRede: { tipo: "excessao" } },
  "Possamai":             { manter: { tipo: "excessao" }, subirIndividual: { tipo: "excessao" }, subirComRede: { tipo: "excessao" } },
  "Lajeado":              { manter: { tipo: "excessao" }, subirIndividual: { tipo: "excessao" }, subirComRede: { tipo: "excessao" } },

  // ============== Lojas a RETIRAR ==============
  "Onzi Rossi":           { manter: { tipo: "retirar" }, subirIndividual: { tipo: "retirar" }, subirComRede: { tipo: "retirar" } },
  "Formiaço":             { manter: { tipo: "retirar" }, subirIndividual: { tipo: "retirar" }, subirComRede: { tipo: "retirar" } },
  "Madewalker":           { manter: { tipo: "retirar" }, subirIndividual: { tipo: "retirar" }, subirComRede: { tipo: "retirar" } },
  "AT Madeiras":          { manter: { tipo: "retirar" }, subirIndividual: { tipo: "retirar" }, subirComRede: { tipo: "retirar" } },

  // ============== Lojas com correções ==============
  "Fernando Osório": {
    manter: { tipo: "x" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação de Lançamentos", 5),  // "Lançamentos (3 padrões)" sem +pts explícito — cliente sugere o tier 3pad=5pts
      acao("Performance da Rede", 10)          // Rede +20 = Rede 10 + Coringa 10
    ], coringaBonus: 10 }
  },
  "Mar Mad": {
    manter: { tipo: "ok" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Profundidade Geral", 10),  // "Profundidade (13 padrões) +10pts"
      acao("Volume Mensal", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "R15": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),  // "Lançamentos (5 padrões) +10pts" é tier absoluto; se já tem 3pad(+5) então +5 incremental
      acao("Meta Ultra Premium", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "MM Móveis (Mourão)": {
    manter: { tipo: "x" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação de Lançamentos", 5),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Gonzaga": {
    manter: { tipo: "x" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação de Lançamentos", 5),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Tok Madeiras": {
    manter: { tipo: "x" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação de Lançamentos", 5),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Madetintas": {
    manter: { tipo: "ok" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 10),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Profundidade Geral", 5),
      acao("Volume Mensal", 5)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 10),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Atacadão (JPA)": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Profundidade Geral", 10),
      acao("Volume Mensal", 10)
    ]},
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Profundidade Geral", 10),
      acao("Volume Mensal", 20)  // "Volume (750m³) +20pts" incremental = 20-0=20 se atual=0, ou 20-10=10 se já em 10
    ]},
    subirComRede: { tipo: "ok" }
  },
  "Balttifer": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Profundidade Geral", 5),
      acao("Volume Mensal", 5)
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "ok" }
  },
  "Madeireiro Ubatuba": {
    manter: { tipo: "ok" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Profundidade Geral", 10),
      acao("Volume Mensal", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Gravex": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Fiel": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 10),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Profundidade Geral", 5),
      acao("Volume Mensal", 5)
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "ok" }
  },
  "W Center": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Voltarelli": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10)
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10)
    ]}
  },
  "Brotas": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10)
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Brandão": {
    manter: { tipo: "ok" },
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10),
      acao("Volume Mensal", 10),
      acao("Performance da Rede", 10)
      // XLSX escreveu "Rede +15pts" — Rede 10 + Coringa 5
    ], coringaBonus: 5 }
  },
  "Simão (JM)": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Nobres", 10),
      acao("Meta Total", 10),
      acao("Volume Mensal", 20)
    ]},
    subirIndividual: { tipo: "x" },
    subirComRede: { tipo: "x" }
  },
  "Grupo 2000": {
    manter: { tipo: "x" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação de Lançamentos", 5),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Serigy": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Ultra Premium", 10),
      acao("Meta Nobres", 10),
      acao("Volume Mensal", 10)  // "Volume (750m³) +20pts" absoluto → +10 incremental (já tem 10)
    ]},
    subirIndividual: { tipo: "x" },
    subirComRede: { tipo: "x" }
  },
  "Comercial Lima": {
    manter: { tipo: "x" },
    subirIndividual: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Positivação de Lançamentos", 5),
      acao("Meta Ultra Premium", 10)
    ]},
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação de Lançamentos", 5),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },
  "Madegem": {
    manter: { tipo: "correcao", acoes: [
      acao("Positivação de Lançamentos", 5)  // "Lançamentos (2 padrões) +10pts" absoluto → +5 incremental
    ]},
    subirIndividual: { tipo: "ok" },
    subirComRede: { tipo: "correcao", acoes: [
      acao("Positivação Grupo 1", 10),
      acao("Meta Ultra Premium", 10),
      acao("Performance da Rede", 10)
    ], coringaBonus: 10 }
  },

  // ============== Lojas "OK" (sem correção listada) ==============
  "Revest":         { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Distribuidora MR": { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Empório":        { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Marisol (Luz Mar)": { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Madewahl":       { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Monteiro":       { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Tecnobord (Kraft)": { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Casa do Marceneiro (Adamy)": { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Anápolis":       { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "S&S":            { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Araújo":         { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Renascer":       { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Madecasa (Arasan)": { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Acasel":         { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Laminil":        { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Armazém":        { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Bama":           { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Tobias":         { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Giacomo":        { manter: { tipo: "ok" }, subirIndividual: { tipo: "ok" }, subirComRede: { tipo: "ok" } },
  "Fazzio":         { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },
  "Pro-Móvel":      { manter: { tipo: "ok" }, subirIndividual: { tipo: "x" }, subirComRede: { tipo: "x" } },

  // ============== Lojas faltantes no relatório original (item 8 do MD) ==============
  // XLSX não lista — sem expectativa, asserts de sanidade apenas.
  "Domingues":  null,
  "Madeicom":   null,
  "Rimad":      null,
  "Rudegon":    null,
  "Orletti":    null
};
