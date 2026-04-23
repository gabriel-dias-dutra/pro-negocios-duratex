// ================================================================
// TEST.JS — Motor de Recomendações (55 parceiros reais)
// ================================================================
// Uso: node test.js [--fail-only] [--loja <nome>] [--verbose]
// Critério: motor está CORRETO se fecha o gap sem ultrapassar em excesso.
// Não exige caminho idêntico ao XLSX — só matemática correta.
// ================================================================

const fs = require("fs");
const path = require("path");

const MOTOR_PATH = path.join(__dirname, "motor_recomendação.js");
const motorSource = fs.readFileSync(MOTOR_PATH, "utf-8");
const indice = JSON.parse(fs.readFileSync(path.join(__dirname, "metrics_real", "_indice.json"), "utf-8"));
const expectedByLoja = require("./expected_xlsx.js");

const FAIL_ONLY = process.argv.includes("--fail-only");
const VERBOSE = process.argv.includes("--verbose");
const filterLoja = (() => {
  const i = process.argv.indexOf("--loja");
  return i >= 0 ? process.argv[i + 1] : null;
})();

function runMotor(metricsJson) {
  const $input = { first: () => ({ json: metricsJson }) };
  const fn = new Function("$input", motorSource);
  return fn($input);
}

const results = [];
const assert = (ctx, regra, ok, detalhe) => results.push({ ctx, regra, ok, detalhe });

// Overshoot aceitável: diferença entre pontosFinal e pontosAlvo deve ser pequena
// (idealmente 0). Tolerância reflete granularidade mínima das ações:
//   - Cenários sem rede: ações têm granularidade 5 (menor tier Lanç/Vol) → tolerância 5
//   - Cenários com rede: Coringa entra com granularidade 10 → tolerância 10
const OVERSHOOT_TOLERADO_SEM_REDE = 5;
const OVERSHOOT_TOLERADO_COM_REDE = 10;

console.log("=".repeat(90));
console.log("TEST SUITE — Motor vs XLSX (55 parceiros)");
console.log("Critério: gap fechado + overshoot ≤ " + OVERSHOOT_TOLERADO_SEM_REDE + "pts (sem rede) ou " + OVERSHOOT_TOLERADO_COM_REDE + "pts (com rede, Coringa +10)");
console.log("=".repeat(90));

for (const entry of indice) {
  if (filterLoja && entry.nomeXlsx !== filterLoja) continue;

  const nomeXlsx = entry.nomeXlsx;
  const expect = expectedByLoja[nomeXlsx];
  const metricsJson = JSON.parse(fs.readFileSync(path.join(__dirname, "metrics_real", entry.arquivo), "utf-8"));

  let output;
  try {
    output = runMotor(metricsJson);
  } catch (e) {
    console.log(`\n[${nomeXlsx}] ❌ ERRO: ${e.message}`);
    assert(nomeXlsx, "motor executou", false, e.message);
    continue;
  }
  const json = output.json;

  if (!FAIL_ONLY) {
    console.log(`\n[${nomeXlsx}] pos=${json.status.posicaoAtual} score=${json.status.scoreEfetivo}`);
  }

  // Loja sem entry ou com null (faltantes do XLSX): só sanidade
  if (!expect) {
    assert(nomeXlsx, "motor processou sem erro", true, "ok");
    continue;
  }

  for (const cenNome of ["manter", "subirIndividual", "subirComRede"]) {
    const cenario = json.cenarios[cenNome];
    const cenExpect = expect[cenNome];
    if (!cenario) {
      assert(`${nomeXlsx}/${cenNome}`, "cenário existe", false, "ausente");
      continue;
    }

    const acoesStr = (cenario.acoes || []).map(a => `${a.nome}(+${a.pontos})`).join(", ");
    const omit = cenario.omitirDoEmail ? " [OMIT]" : "";
    if (!FAIL_ONLY) {
      console.log(`  ${cenNome}${omit}: gap=${cenario.gap} final=${cenario.gapFinal || 0} pontosFinal=${cenario.pontosFinal || cenario.pontosAtuais} → ${acoesStr || "(vazio)"}`);
      if (cenario.notaCoringa?.bonus > 0) {
        console.log(`    + Coringa: +${cenario.notaCoringa.bonus}pts (soma meios: ${cenario.notaCoringa.somaMeios})`);
      }
    }

    // Cenários onde XLSX diz X/Excessão/Retirar: motor deve omitir
    if (cenExpect && (cenExpect.tipo === "x" || cenExpect.tipo === "excessao" || cenExpect.tipo === "retirar")) {
      if (cenExpect.tipo === "x") {
        assert(`${nomeXlsx}/${cenNome}`, "cenário X (omitido)",
          !!cenario.omitirDoEmail,
          `omitirDoEmail=${!!cenario.omitirDoEmail}`);
      } else {
        // Excessão/Retirar: motor pode fazer qualquer coisa (sem expectativa clara)
        assert(`${nomeXlsx}/${cenNome}`, `cenário ${cenExpect.tipo} (aceita qualquer)`, true, "ok");
      }
      continue;
    }

    // Cenários ativos (OK ou correção): aplicar critério matemático
    //   (1) cenário já atingido → OK automaticamente
    //   (2) gapFinal == 0 → OK (motor fechou o gap)
    //   (3) gapFinal > 0 mas cenarioViavel=true → pode ser Coringa condicional
    //   (4) pontosFinal NÃO deve ultrapassar pontosAlvo em mais de OVERSHOOT_TOLERADO

    if (cenario.jaAtingida) {
      assert(`${nomeXlsx}/${cenNome}`, "meta já atingida", true, "ok");
      continue;
    }

    const pontosFinal = cenario.pontosFinal || cenario.pontosAtuais;
    const pontosAlvo = cenario.pontosAlvo;
    const overshoot = pontosFinal - pontosAlvo;
    const gapFechado = (cenario.gapFinal || 0) === 0;

    // Critério 1: gap fechado
    assert(`${nomeXlsx}/${cenNome}`, "gap fechado (gapFinal=0)",
      gapFechado,
      `gapFinal=${cenario.gapFinal}`);

    // Critério 2: não ultrapassou o alvo em excesso
    const tolerancia = cenNome === "subirComRede" ? OVERSHOOT_TOLERADO_COM_REDE : OVERSHOOT_TOLERADO_SEM_REDE;
    assert(`${nomeXlsx}/${cenNome}`, `overshoot ≤ ${tolerancia}pts`,
      overshoot <= tolerancia,
      `pontosFinal=${pontosFinal} alvo=${pontosAlvo} overshoot=${overshoot}`);

    // Critério 3: ações fazem sentido matemático (soma = ganho esperado)
    const somaAcoes = (cenario.acoes || []).reduce((acc, a) => acc + a.pontos, 0);
    const coringaContribuicao = (cenario.notaCoringa?.redeTotal?.jaBatida || cenNome === "subirComRede")
      ? (cenario.notaCoringa?.bonus || 0) : 0;
    const somaTotal = somaAcoes + coringaContribuicao;
    // pontosFinal deve bater: scoreEfetivo + somaTotal = pontosFinal
    const scoreEfetivo = json.status.scoreEfetivo;
    const esperado = scoreEfetivo + somaTotal;
    assert(`${nomeXlsx}/${cenNome}`, "soma consistente (score+ações+coringa)",
      Math.abs(esperado - pontosFinal) <= 1, // tolerância 1pt para floating
      `score(${scoreEfetivo}) + ações(${somaAcoes}) + coringa(${coringaContribuicao}) = ${esperado}, motor=${pontosFinal}`);
  }
}

// --- Relatório ---
console.log("\n" + "=".repeat(90));
console.log("RESULTADO");
console.log("=".repeat(90));

const falhas = results.filter(r => !r.ok);
const sucessos = results.filter(r => r.ok);

if (falhas.length > 0 || FAIL_ONLY) {
  console.log(`\n❌ FALHAS (${falhas.length}):`);
  for (const r of falhas) {
    console.log(`  ❌ [${r.ctx}] ${r.regra} — ${r.detalhe}`);
  }
}

const porLoja = {};
for (const r of results) {
  const loja = r.ctx.split("/")[0];
  porLoja[loja] = porLoja[loja] || { pass: 0, fail: 0 };
  if (r.ok) porLoja[loja].pass++; else porLoja[loja].fail++;
}

console.log(`\n=== Resumo por loja ===`);
for (const [loja, s] of Object.entries(porLoja).sort()) {
  const icon = s.fail === 0 ? "✅" : "❌";
  console.log(`  ${icon} ${loja}: ${s.pass} ✅  ${s.fail} ❌`);
}

console.log(`\nTOTAL: ${sucessos.length} ✅  ${falhas.length} ❌\n`);
process.exit(falhas.length > 0 ? 1 : 0);
