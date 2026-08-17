// Simulation API avec 2 sources réelles (lecture locale au lieu du réseau)
const fs = require("fs");
const { parseAMFBlacklist } = require("./lib/amf-parser");
const { parsePSAN } = require("./lib/psan-parser");
const { analyze } = require("./lib/matcher-v2");

const blacklist = parseAMFBlacklist(fs.readFileSync("./sample-data/liste-noire-amf-format-reel.csv","utf-8"));
const psan = parsePSAN(fs.readFileSync("./sample-data/liste-psan-format-reel.csv","utf-8"));
const regules = [
  { nom:"Trade Republic Bank GmbH", statut:"Agréé — établissement de paiement", source:"REGAFI" },
  ...psan.map(p => ({ nom:p.nom, statut:p.statut, source:"PSAN (AMF)" }))
];

function api(nom){
  const r = analyze(nom.trim(), { blacklist, regules });
  return { recherche:nom, verdict:r.verdict, raison:r.raison,
    detail:r.detail?.nom || r.detail?.entite?.nom || null,
    stats:{ liste_noire:blacklist.length, psan:psan.length } };
}

console.log("=== API 2 sources (liste noire AMF + PSAN) ===\n");
["Coinhouse","Coinhouse Invest","Global Capital Invest","Bitpanda GmbH","Truc Inconnu"].forEach(q=>{
  console.log(JSON.stringify(api(q)));
});
