// Extrai cada parceiro da execução 4946994 do n8n e salva em docs/metrics_real/
// Uso: node extract_metrics.js <caminho_para_execution_file>

const fs = require("fs");
const path = require("path");

const execFile = process.argv[2];
if (!execFile) {
  console.error("Uso: node extract_metrics.js <caminho_para_execution_file>");
  process.exit(1);
}

const outDir = path.join(__dirname, "metrics_real");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Mapeamento: client name (do Get Metrics) → nome canônico (linha do XLSX)
// Nomes canônicos extraídos da aba "Regras Atuais", coluna A.
const MAPA_CLIENTE_XLSX = {
  "GRUPO RIMAD": "Rimad",
  "GRUPO ORLETTI": "Orletti",
  "DISTRIBUIDORA DOMINGUES COMERCIO E  INDUSTRIA LTDA": "Domingues",
  "GRUPO MADEICOM / G.VIEIRA": "Madeicom",
  "GRUPO RUDEGON": "Rudegon",
  "FAZZIO MADEIRAS COMERCIAL LTDA": "Fazzio",
  "GRUPO CASA GIACOMO": "Giacomo",
  "PRO-MOVEL COMERCIO DE PRODUTOS  PARA MOVEIS LTDA.": "Pro-Móvel",
  "GRUPO BAMA": "Bama",
  "GRUPO ARMAZEM DA MARCENARIA": "Armazém",
  "COMERCIO DE CHAPAS DE MDF LAMINIL  LTDA": "Laminil",
  "MADEGEM - COMERCIO DE MADEIRAS LTDA": "Madegem",
  "COMERCIO DE COMPENSADOS LAJEADO  LTDA": "Lajeado",
  "GRUPO ACASEL": "Acasel",
  "GRUPO MAD TOBIAS": "Tobias",
  "GRUPO SERIGY": "Serigy",
  "GRUPO 2000 DISTRIBUIDORA": "Grupo 2000",
  "GRUPO ARASAN": "Madecasa (Arasan)",
  "GRUPO RENASCER MADEIRAS": "Renascer",
  "GRUPO COMERCIAL LIMA": "Comercial Lima",
  "GRUPO JM": "Simão (JM)",
  "S & S COMERCIO DE MADEIRA  DENSIFICADA E FERRAGENS LTDA": "S&S",
  "GRUPO MADEREIRA BRANDAO": "Brandão",
  "GRUPO BROTAS": "Brotas",
  "GRUPO ARAUJO MADEIRAS": "Araújo",
  "GRUPO COMPENSADOS ANAPOLIS": "Anápolis",
  "GRUPO ADAMY": "Casa do Marceneiro (Adamy)",
  "KRAFT COMERCIO E IMPORTACAO DE  FERRAGENS LTDA": "Tecnobord (Kraft)",
  "COMERCIAL MADEWALKER LTDA": "Madewalker",
  "POSSAMAI COMERCIO DE MADEIRAS LTDA": "Possamai",
  "COMERCIO DE MADEIRAS VOLTARELLI  LTDA": "Voltarelli",
  "W CENTER MADEIRAS E FERRAGENS LTDA": "W Center",
  "GRUPO MONTEIRO MADEIRAS": "Monteiro",
  "GRUPO A T MADEIRAS": "AT Madeiras",
  "FIEL MADEIRAS LTDA": "Fiel",
  "GRUPO GRAVEX": "Gravex",
  "GRUPO MADEWAHL": "Madewahl",
  "LUZ MAR MADEIRAS LTDA": "Marisol (Luz Mar)",
  "GRUPO EMPORIO": "Empório",
  "MADEIREIRO DE UBATUBA COMERCIAL  LTDA": "Madeireiro Ubatuba",
  "DISTRIBUIDORA MR DE ARARUAMA LTDA": "Distribuidora MR",
  "GRUPO BALTTI": "Balttifer",
  "GRUPO JPA": "Atacadão (JPA)",
  "GRUPO MADETINTAS": "Madetintas",
  "GRUPO TOK MADEIRAS": "Tok Madeiras",
  "GRUPO AGENCESLAU / CASA MDF": "Casa do MDF (Agenceslau)",
  "COMERCIO DE MADEIRAS GONZAGA LTDA": "Gonzaga",
  "MOURAO MADEIRAS LTDA": "MM Móveis (Mourão)",
  "GRUPO R15 COMERCIO": "R15",
  "MAR MAD MADEIRAS LTDA": "Mar Mad",
  "MADEIREIRA FERNANDO OSORIO LTDA": "Fernando Osório",
  "FORMIACO COMERCIO LTDA": "Formiaço",
  "ONZI & ROSSI LTDA": "Onzi Rossi",
  "GRUPO REVEST": "Revest",
  "HORIZONTE LAVRAS LTDA": "Madtex (Lavras)"
};

const slugify = (s) =>
  s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const raw = JSON.parse(fs.readFileSync(execFile, "utf-8"));
const runs = raw.data.resultData.runData["Call [Class] Get Metrics"];

const indice = [];
const naoMapeados = [];

for (let i = 0; i < runs.length; i++) {
  const item = runs[i].data.main[0][0].json;
  const client = item.info?.client || `desconhecido_${i}`;
  const nomeCanonico = MAPA_CLIENTE_XLSX[client];
  if (!nomeCanonico) naoMapeados.push(client);
  const slug = slugify(nomeCanonico || client);
  const arquivo = `${slug}.json`;
  fs.writeFileSync(path.join(outDir, arquivo), JSON.stringify(item, null, 2));
  indice.push({
    arquivo,
    client,
    nomeXlsx: nomeCanonico || null,
    seller: item.info?.seller || null,
    idxNaExecucao: i
  });
}

fs.writeFileSync(path.join(outDir, "_indice.json"), JSON.stringify(indice, null, 2));

console.log(`Total: ${runs.length} parceiros`);
console.log(`Mapeados: ${indice.filter(e => e.nomeXlsx).length}`);
console.log(`Não mapeados: ${naoMapeados.length}`);
if (naoMapeados.length) {
  console.log("Não mapeados (precisam mapeamento manual):");
  for (const nm of naoMapeados) console.log("  -", nm);
}
console.log(`\nArquivos salvos em: ${outDir}`);
