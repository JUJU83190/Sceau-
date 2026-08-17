const fs = require("fs");
const { parseAMFBlacklist } = require("./lib/amf-parser");
const { analyze } = require("./lib/matcher-v2");

const csv = fs.readFileSync("./sample-data/liste-noire-amf-format-reel.csv", "utf-8");
const blacklist = parseAMFBlacklist(csv);

console.log(`✓ Parsé ${blacklist.length} entités depuis le format réel AMF\n`);
console.log("Aperçu des données parsées :");
blacklist.forEach(e => console.log(`  · ${e.nom} | ${e.categorie} | ${e.date_inscription}`));

// Test bout-en-bout : parseur réel + moteur d'usurpation
const regules = [
  { nom:"Trade Republic Bank GmbH", statut:"Agréé paiement" },
  { nom:"Boursorama SA", statut:"Agréé crédit" },
];

console.log("\n=== Test bout-en-bout (parseur réel + détection usurpation) ===");
const cas = [
  ["Global Capital Invest", "danger"],
  ["Global Capital Invest Ltd", "danger"],
  ["Trade Republic Investment", "usurpation"],
  ["Boursorama SA", "safe"],
  ["Ma Boulangerie", "inconnu"],
];
let ok = 0;
cas.forEach(([q, attendu]) => {
  const r = analyze(q, { blacklist, regules });
  const pass = r.verdict === attendu;
  if(pass) ok++;
  console.log(`${pass?"✅":"❌"} "${q}" → ${r.verdict} (attendu ${attendu})`);
});
console.log(`\n${ok}/${cas.length} tests réussis`);
