const fs = require("fs");
const { parsePSAN } = require("./lib/psan-parser");
const { parseAMFBlacklist } = require("./lib/amf-parser");
const { analyze } = require("./lib/matcher-v2");

const psan = parsePSAN(fs.readFileSync("./sample-data/liste-psan-format-reel.csv","utf-8"));
const blacklist = parseAMFBlacklist(fs.readFileSync("./sample-data/liste-noire-amf-format-reel.csv","utf-8"));

console.log(`✓ PSAN parsés : ${psan.length} prestataires crypto enregistrés`);
psan.forEach(p => console.log(`  · ${p.nom} (${p.pays_siege}) — ${p.no_amf}`));

// On enrichit les "régulés" avec les PSAN (crypto régulé = catégorie régulée)
const regules = [
  { nom:"Trade Republic Bank GmbH", statut:"Agréé — établissement de paiement" },
  ...psan.map(p => ({ nom:p.nom, statut:p.statut }))
];

console.log("\n=== Test croisement liste noire + PSAN ===");
const cas = [
  ["Coinhouse", "safe", "PSAN régulé"],
  ["Coinhouse Invest", "usurpation", "usurpation d'un PSAN régulé"],
  ["Bitpanda GmbH", "safe", "PSAN régulé"],
  ["Global Capital Invest", "danger", "liste noire"],
  ["Paymium", "safe", "PSAN régulé"],
  ["Coinhaus", "usurpation", "faute d'orthographe sur Coinhouse"],
  ["Truc Random", "inconnu", "rien"],
  ["OldRegisteredExchange", "inconnu", "PSAN radié : ne doit plus être considéré comme régulé"],
];
let ok=0;
cas.forEach(([q,attendu,note]) => {
  const r = analyze(q, { blacklist, regules });
  const pass = r.verdict===attendu;
  if(pass) ok++;
  console.log(`${pass?"✅":"❌"} "${q}" → ${r.verdict} (attendu ${attendu} — ${note})`);
});
console.log(`\n${ok}/${cas.length} réussis`);
