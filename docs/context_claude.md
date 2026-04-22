# Motor de Recomendações Pro Negócios — Documento de Contexto

## 1. Visão Geral

Sistema automático de recomendações comerciais que roda no n8n. Analisa métricas de parceiros (clientes) a partir de uma planilha Excel no OneDrive e gera e-mails personalizados com cenários de ação para melhorar a posição na Política Comercial.

### Arquitetura (Fluxo n8n)

```
[OneDrive Excel] → [Get Metrics (vários)] → [Code Node: Motor de Recomendações] → [AI Agent GPT] → [Gmail]
```

- **Get Metrics**: Vários code nodes que leem a planilha e extraem as 10 métricas do parceiro.
- **Motor de Recomendações**: Code node JavaScript (~740 linhas) que recebe as métricas, calcula o score efetivo, gera 3 cenários de recomendação e entrega um JSON estruturado.
- **AI Agent GPT**: Recebe o JSON e monta o HTML do e-mail seguindo um template fixo (System Prompt + Input Text).
- **Gmail**: Envia o e-mail ao vendedor responsável pelo parceiro.

### Arquivos do Projeto

| Arquivo | Descrição |
|---|---|
| `recommendation-engine-n8n.js` | Motor de produção — o código do Code Node n8n (~740 linhas) |
| `test.js` | Test suite completo — valida todas as regras com checks dinâmicos por cliente |
| `PROMPT_AGENT_v2.md` | System Prompt do AI Agent que monta o HTML do e-mail |
| `INPUT_TEXT_AGENT.md` | Template do input text do Agent (expressões n8n) |
| `get-volume-corrigido.js` | Get Metrics do Volume (corrigido) |
| `get-politica-corrigido.js` | Get Metrics da Política (corrigido, com tabelaPosicoes) |
| `get-profundidade-pontos-corrigido.js` | Get Metrics da Profundidade de Pontos |
| `dashboard-regras.jsx` | Dashboard interativo React com 3 abas (Regras, Exemplo, Cenários) |

---

## 2. Tabela de Posições (Política Comercial)

| Posição | Score Necessário | Desconto |
|---|---|---|
| F | 0 pts | 0% |
| E | 25 pts | 5% |
| D | 50 pts | 7% |
| C | 70 pts | 9% |
| B | 80 pts | 12% |
| A | 90 pts | 14% |

---

## 3. As 10 Métricas

O motor recebe 10 métricas do Get Metrics. Cada uma contribui para o score do parceiro:

| Métrica | Pontos Máx | Regra de "Batida" |
|---|---|---|
| Profundidade de Pontos | 10-20pts | Múltiplos tiers: 40 pad=10pts, 60 pad=15pts, 80 pad=20pts |
| Positivação Grupo 1 (G1) | 10pts | 10 padrões internos positivados |
| Positivação Lançamentos | 5-10pts | 3 padrões=5pts, 5 padrões=10pts |
| Ultra Premium | 10pts | ≥ 15m³ de volume Ultra no trimestre |
| Meta Nobre | 10pts | Carteira ÷ Meta ≥ 98% |
| Meta Total | 10pts | Carteira ÷ Meta ≥ 98% |
| Volume Mensal | 5-30pts | Múltiplos tiers: 100m³=5pts, 150m³=10pts, 250m³=20pts, 500m³=30pts |
| Performance da Rede | 10pts | Rede atinge ≥ 100% meta Nobres |
| Profundidade Geral | 5-20pts | Mesma que Prof. Pontos mas usada como ação (tiers dinâmicos) |
| Pontos Coringa | 5-10pts | Bônus SEPARADO: rede atinge ≥ 100% meta TOTAL (ver seção 6) |

---

## 4. Regras de Negócio (v5)

### 4.1 Score Efetivo

O sistema pode mostrar score = 0 por timing de fechamento. O motor RECALCULA usando valores reais:

- **Ultra Premium**: Se `valorAtual ≥ 15m³` → meta batida (10pts), mesmo que `scoreAtual = 0`
- **Meta Nobre/Total**: Se `carteira ÷ meta ≥ 98%` → meta batida (10pts)
- **Profundidade de Pontos**: Usa `scoreAtual` direto (único confiável)
- **Volume**: Usa `posicaoAtual.pontuacaoGanha` direto
- **Performance da Rede**: Se `percentilNobre ≥ 100%` → 10pts garantidos
- **Score Efetivo** = soma de TODAS as métricas recalculadas

### 4.2 Posição Efetiva

O motor não confia na `posicaoAtual` do sistema. Usa a `tabelaPosicoes` (enviada pelo Get Política) para calcular a posição real com base no `scoreEfetivo`:

```
Para cada posição na tabela (F→A):
  Se scoreEfetivo ≥ posicao.score → posicaoEfetiva = essa posição
```

Exemplo: Sistema diz "D" (50pts), mas scoreEfetivo = 70pts → posição efetiva = **C** (70pts).

### 4.3 Cálculo dos Gaps

- **Gap MANTER** = `ultimoTrimestre.score - scoreEfetivo` (mínimo 0)
- **Gap SUBIR** = `proximoNivel.score - scoreEfetivo` (mínimo 0)
- Se gap ≤ 0 → meta já atingida, sem ações (retorna `jaAtingida: true`)
- São gerados 3 cenários: MANTER, SUBIR Individual, SUBIR com Rede

### 4.4 Ordem de Prioridades (fila de ações)

As ações são processadas nesta ordem fixa. O motor PARA quando o gap é zerado:

| Posição | Ação | Condição |
|---|---|---|
| 1 | Positivação Grupo 1 | Se G1 < 10 padrões |
| 2 | Positivação Lançamentos | Se lançamentos não atingidos |
| 3 | Meta Ultra Premium | Se < 15m³ |
| 4 | Profundidade Geral FÁCIL | Se faltam < 10 padrões para tier |
| 5 | Meta Nobre | Se carteira < 98% meta |
| 6 | Meta Total | Dinâmica (depende da Nobre) |
| 7 | Profundidade Geral DIFÍCIL | Se faltam ≥ 10 padrões |
| 8+ | Volume / Rede | Cenário sem Rede: Vol FÁCIL (8) → Vol DIFÍCIL (11). Cenário Rede: Rede (8) → Vol FÁCIL (9) → Vol DIFÍCIL (10) |

**Regra crítica**: Profundidade Geral aparece **NO MÁXIMO 1 vez** por cenário. Se FÁCIL foi usada na pos 4, DIFÍCIL (pos 7) é pulada.

### 4.5 Detecção ULTRA e Multi-impacto (G1)

Itens do G1 são priorizados para maximizar o impacto:

1. **Tier 1**: ULTRA + histórico 12 meses (resolve G1 + Ultra Premium com 1 compra)
2. **Tier 2**: ULTRA + sem histórico
3. **Tier 3**: Normal + histórico
4. **Tier 4**: Normal + sem histórico

Detecção ULTRA usa `.includes("ULTRA")` — funciona com `"ULTRA"`, `"ULTRA PREMIUM"`, etc.

Se produto ULTRA sugerido no G1, a ação Ultra Premium faz **cross-reference**: "aproveite para comprar do [produto] já sugerido no G1".

### 4.6 Meta Total — 3 Comportamentos

1. **Coberta pela Nobre**: Se Meta Nobre recomendada E cobre Total → vem "de graça" (0m³ adicionais)
2. **Precisa volume extra**: Se Nobre recomendada MAS não cobre → calcula `precisaMaisParaTotal = max(0, precisaTotal - precisaNobre)`
3. **Independente**: Se Nobre já batida → Total avaliada sozinha

### 4.7 Volume Mensal

- Meta é **MENSAL** (ex: 250m³/mês), gap é **TRIMESTRAL**
- `faltaMensal = faltaTrimestral ÷ mesesRestantes`
- Meses restantes: calculado pela data (Q1 Jan=3,Fev=2,Mar=1; Q2 Abr=3... etc.)
- Classificação: `ratio = faltaTrimestral ÷ metaTotal`. Se < 130% → FÁCIL, senão DIFÍCIL
- Descrição inclui: meta mensal, gap trimestral, pallets tri, gap mensal, pallets mensal, meses restantes

**IMPORTANTE** (Get Volume corrigido): A planilha compara `volume_trimestral / 3` (média mensal) com a meta mensal. O Get Volume antigo comparava o trimestral direto com a meta mensal (bug). Agora usa `mediaMensal = valorReferencia / 3`.

---

## 5. Performance da Rede

- **Ação** (só no cenário 3): Rede atingir 100% meta **NOBRES** → +10pts
- **Condição separada**: Rede atingir 100% meta **TOTAL** → bônus Coringa adicional (5-10pts)
- São duas recompensas independentes

---

## 6. Pontos Coringa

### Quando é calculado

O Coringa é calculado no cenário com Rede quando:
- A Rede foi **recomendada como ação** OU
- A Rede **já está batida** (percentilNobre ≥ 100%)

Também é calculado no **early return** (gap = 0) se `isCenarioRede && redeMet`.

### Tabela de bônus

Soma das profundidades = Prof.Pontos + G1 + Lançamentos + Ultra (valores **PROJETADOS**, não atuais):

| Soma | Bônus |
|---|---|
| ≥ 40pts | +10pts |
| ≥ 45pts | +5pts |
| ≥ 50pts | 0pts |

### Coringa GARANTIDO vs Informativo

- Se `redeTotalPct ≥ 100%` → **GARANTIDO** (campo `redeTotal.jaBatida: true`)
  - Já contabilizado em `pontosFinal` e `gapFinal`
  - Se fecha o gap sozinho → loop para, NÃO recomenda mais ações
- Se `redeTotalPct < 100%` → **Informativo** (condicionado à rede bater meta Total)

### Otimização do tier de Prof Geral

No cenário Rede, o motor simula o Coringa para cada tier de Prof Geral e escolhe o que maximiza `pontosIncrementais + coringaBonus`. Em empate, prefere o tier que preserva o Coringa.

---

## 7. Template do E-mail

### Ordem das seções

1. Saudação (nome do parceiro)
2. **Status Atual**: Posição [efetiva] com [scoreEfetivo] pontos
3. **Metas já batidas** ([soma]pts) — caixa verde com lista das métricas garantidas
4. **Referência**: No último trimestre posição foi [X] ([Y] pontos)
5. **Cenário 1 — MANTER**: ações ou "meta já atingida"
6. **Cenário 2 — SUBIR Individual**: ações ou "meta já atingida"
7. **Cenário 3 — SUBIR com Rede**: ações + nota Coringa (se aplicável)

### Formatação dos itens de ação

Cada `<li>` de ação tem:
- **Nome da ação** em negrito + descrição
- Produtos (se houver) em cinza `#555`
- Resumo em itálico cinza `#777`: `[nome] → +[pontos]pts` (sem acumulado, formato encurtado)

### Nota Coringa

Quando `notaCoringa` existe com `bonus > 0`:
- Caixa amarela clara com texto de `notaCoringa.descricao`
- Se `redeTotal.jaBatida = true` e `acoes[]` vazio → destacar que Coringa GARANTIDO fecha o gap sozinho

---

## 8. Input Text do Agent (n8n)

```
Cliente: {{ $('Loop Over Items').item.json.selles.client }}
Vendedor: {{ $('Loop Over Items').item.json.selles.seller }}
Dados: {{ $('Code Node Motor Recomendações').item.json.toJsonString() }}
```

---

## 9. Exemplo de Input do Motor (Cliente Representativo)

Este cliente tem: 42 padrões (10pts Prof), G1 pendente (4/10), Lançamentos pendente (0/5), Ultra 3.21m³ (pendente), Nobre 94% (pendente), Total 55% (pendente), Volume 0pts, Rede Nobres 75% / Total 81% (pendentes). Posição sistema: F, último tri: B (80pts), próximo: A (90pts).

```json
{
  "metrics": {
    "Profundidade Pontos": {
      "values": {
        "scoreAtual": 10,
        "valorAtual": 42,
        "posicaoAtual": { "metaAtingida": 40, "pontuacaoGanha": 10 },
        "proximosNiveis": [
          { "metaNecessaria": 60, "pontuacaoPossivel": 15, "pontuacaoAtual": 42, "faltaParaNivel": 18 },
          { "metaNecessaria": 80, "pontuacaoPossivel": 20, "pontuacaoAtual": 42, "faltaParaNivel": 38 }
        ]
      }
    },
    "Profundidade Grupo 1": {
      "values": {
        "scoreAtual": 0,
        "itensValidos": [
          { "label": "GIANDUIA (TRAMA)", "status": "OK", "group": "GRUPO 1" },
          { "label": "OFF WHITE SUAVE (SENSE)", "status": "OK", "group": "" },
          { "label": "BRANCO ÁRTICO (ORIGINAL)", "status": "OK", "group": "ULTRA" },
          { "label": "NOCE AMÊNDOA (ESSENCIAL)", "status": "CARTEIRA", "group": "" }
        ],
        "regraAtual": "10 padrões: 10ptos",
        "quantidadeValidos": 4,
        "itensInvalidos": [
          { "label": "TITÂNIO (TRAMA)", "status": "Ñ OK", "group": "" },
          { "label": "AURORA (TRAMA)", "status": "Ñ OK", "group": "" },
          { "label": "PALHA (TRAMA)", "status": "Ñ OK", "group": "" },
          { "label": "CARVALHO LIR (PRISMA)", "status": "Ñ OK", "group": "" },
          { "label": "CARVALHO DIAN (PRISMA)", "status": "Ñ OK", "group": "" },
          { "label": "GIANDUIA PURO (SENSE)", "status": "Ñ OK", "group": "" },
          { "label": "LINHO BELGA (SENSE)", "status": "Ñ OK", "group": "" },
          { "label": "PRETO (ORIGINAL)", "status": "Ñ OK", "group": "ULTRA" },
          { "label": "NOCE MARE (ESSENCIAL)", "status": "Ñ OK", "group": "" },
          { "label": "AMÊNDOLA RÚSTICA (PRISMA)", "status": "Ñ OK", "group": "" },
          { "label": "LARNACA (PRISMA)", "status": "Ñ OK", "group": "" },
          { "label": "NOGUEIRA CADIZ (PRISMA)", "status": "Ñ OK", "group": "" }
        ]
      }
    },
    "Profundidade Últimos 12 meses": {
      "values": {
        "itensValidos": [
          { "label": "GIANDUIA (TRAMA)", "status": "OK" },
          { "label": "TITÂNIO (TRAMA)", "status": "OK" },
          { "label": "AURORA (TRAMA)", "status": "OK" },
          { "label": "PALHA (TRAMA)", "status": "OK" },
          { "label": "CARVALHO LIR (PRISMA)", "status": "OK" },
          { "label": "CARVALHO DIAN (PRISMA)", "status": "OK" },
          { "label": "GIANDUIA PURO (SENSE)", "status": "OK" },
          { "label": "LINHO BELGA (SENSE)", "status": "OK" },
          { "label": "OFF WHITE SUAVE (SENSE)", "status": "OK" },
          { "label": "BRANCO ÁRTICO (ORIGINAL)", "status": "OK" },
          { "label": "NOCE AMÊNDOA (ESSENCIAL)", "status": "OK" }
        ],
        "quantidadeValidos": 11
      }
    },
    "Profundidade Lançamentos": {
      "values": {
        "scoreAtual": 0,
        "regrasAtuais": ["=5 padrões: 10ptos", ">= 3 Padrões: 5ptos"],
        "itensValidos": [],
        "quantidadeValidos": 0,
        "itensInvalidos": [
          { "label": "BEGE PAPIRO (ESSENCIAL)" },
          { "label": "MARROM RETRÔ (ESSENCIAL)" },
          { "label": "HIBISCO (ESSENCIAL)" },
          { "label": "TIMBORANA SILVESTRE (THERA)" },
          { "label": "CARVALHO BRUN (THERA)" }
        ]
      }
    },
    "Profundidade Ultra Premium": {
      "values": {
        "scoreAtual": 0,
        "regraAtual": "15m³: 10ptos; >15m³: 0ptos",
        "valorAtual": 3.21
      }
    },
    "Politica": {
      "values": {
        "scoreAtual": 10,
        "posicaoAtual": "F",
        "descontoAtual": 0,
        "ultimoTrimestre": { "score": 80, "posicao": "B", "desconto": 12 },
        "proximoNivel": { "score": 90, "posicao": "A", "desconto": 14 },
        "tabelaPosicoes": [
          { "posicao": "F", "score": 0, "desconto": 0 },
          { "posicao": "E", "score": 25, "desconto": 5 },
          { "posicao": "D", "score": 50, "desconto": 7 },
          { "posicao": "C", "score": 70, "desconto": 9 },
          { "posicao": "B", "score": 80, "desconto": 12 },
          { "posicao": "A", "score": 90, "desconto": 14 }
        ],
        "labelTriAtual": "REAL (1 TRI'26)"
      }
    },
    "Volume": {
      "values": {
        "posicaoAtual": { "pontuacaoGanha": 0 },
        "proximosNiveis": [
          { "metaNecessaria": 100, "pontuacaoPossivel": 5, "pontuacaoAtual": 63, "faltaParaNivel": 37, "faltaParaNivelTrimestre": 238 },
          { "metaNecessaria": 150, "pontuacaoPossivel": 10, "pontuacaoAtual": 63, "faltaParaNivel": 87, "faltaParaNivelTrimestre": 388 },
          { "metaNecessaria": 250, "pontuacaoPossivel": 20, "pontuacaoAtual": 63, "faltaParaNivel": 187, "faltaParaNivelTrimestre": 688 },
          { "metaNecessaria": 500, "pontuacaoPossivel": 30, "pontuacaoAtual": 63, "faltaParaNivel": 437, "faltaParaNivelTrimestre": 1438 }
        ]
      }
    },
    "Meta Total": {
      "values": {
        "scoreAtual": 0,
        "itensAgrupados": [
          { "label": "META TOTAL", "valor": 114 },
          { "label": "CARTEIRA", "valor": 63, "vsMeta": -50 },
          { "label": "FATURADO", "valor": 53, "vsMeta": -61 }
        ]
      }
    },
    "Meta Nobre": {
      "values": {
        "scoreAtual": 0,
        "itensAgrupados": [
          { "label": "META NOBRES", "valor": 67 },
          { "label": "CARTEIRA", "valor": 63, "vsMeta": -3 },
          { "label": "FATURADO", "valor": 53, "vsMeta": -14 }
        ]
      }
    },
    "Performance Rede": {
      "values": {
        "scoreAtual": 0,
        "percentilNobre": "75%",
        "percentilTotal": "81%"
      }
    }
  }
}
```

Para este cliente, o motor gera: scoreEfetivo=10pts, gap MANTER=70pts, gap SUBIR=80pts. Cenário Rede tem Coringa informativo (+5pts se rede bater meta Total).

---

## 10. Output do Motor (Estrutura JSON)

```json
{
  "status": {
    "posicaoAtual": "F",         // ← posição EFETIVA (não do sistema)
    "descontoAtual": "0%",
    "scoreOficial": 10,           // score que o sistema mostra
    "scoreEfetivo": 10,           // score recalculado pelo motor
    "trimestre": "REAL (1 TRI'26)",
    "ultimoTrimestre": { "posicao": "B", "score": 80, "desconto": "12%" },
    "proximoNivel": { "posicao": "A", "score": 90, "desconto": "14%" }
  },
  "metricasGarantidas": [
    { "nome": "Profundidade de Pontos", "pontos": 10, "detalhe": "42 padrões positivados." }
  ],
  "cenarios": {
    "manter": {
      "titulo": "MANTER Política B",
      "pontosAlvo": 80,
      "pontosAtuais": 10,
      "gap": 70,
      "jaAtingida": false,
      "cenarioViavel": true,
      "pontosFinal": 80,
      "acoes": [ /* lista de ações */ ],
      "notaCoringa": null
    },
    "subirIndividual": { /* mesma estrutura */ },
    "subirComRede": {
      /* mesma estrutura */
      "notaCoringa": {
        "bonus": 5,
        "somaProfundidades": 45,
        "redeTotal": { "percentualAtual": "81%", "falta": "19.0pp", "jaBatida": false },
        "descricao": "Bônus Coringa (+5pts): condicionado à rede atingir 100% da meta TOTAL..."
      }
    }
  }
}
```

---

## 11. Bugs Corrigidos (9 bugs)

| # | Bug | Correção |
|---|---|---|
| 1 | Prof Geral duplicada (aparecia 2× por cenário) | Guard `if (profGeralTierSelecionado) continue` |
| 2 | ULTRA detection falha com "ULTRA PREMIUM" | `isUltra` usa `.includes("ULTRA")` |
| 3 | Coringa não calculado quando Rede já batida | Condição `isCenarioRede && (redeRecomendada \|\| redeMet)` |
| 4 | Test Suite não detectava duplicação | Check "sem métricas duplicadas" por cenário |
| 5 | Descrição Prof duplicada incorreta | Resolvido automaticamente pelo Bug 1 |
| 6 | Coringa ausente no early return (gap=0) | Calcula Coringa antes de retornar quando `isCenarioRede && redeMet` |
| 7 | Get Volume comparava trimestral com meta mensal | `mediaMensal = valorReferencia / 3` |
| 8 | Posição efetiva incorreta no status | Get Política envia `tabelaPosicoes`, motor calcula posição real |
| 9 | Coringa GARANTIDO não abatia ações desnecessárias | Se Coringa fecha gap → loop para. `pontosFinal` inclui bônus garantido |

---

## 12. Convenções de Código

- Linguagem: **JavaScript** (n8n Code Node, sem módulos externos)
- Conversão numérica segura: `const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; }`
- Floating point: `Math.round()` em todos os campos de desconto
- Pallets: `Math.ceil(m³ / 3)` (1 pallet ≈ 3m³)
- Test suite: `node test.js [arquivo_metrics.json]` — saída colorida com checks ✅/❌

---

## 13. Notas Importantes

- O **test-n8n-output.js** foi descontinuado. Apenas `recommendation-engine-n8n.js` e `test.js` são mantidos.
- Os arquivos `REGRAS_DE_NEGOCIO_v2.md` e `REGRAS_DE_NEGOCIO_v3_FINAL.md` estão desatualizados — a fonte da verdade é o código do engine + este documento.
- Toda conversa foi em **português brasileiro**.
- Todos os valores monetários são em **m³** (metros cúbicos), não reais.