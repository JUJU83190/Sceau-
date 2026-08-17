// Simule l'API de production en local (remplace fetch réseau par lecture fichier)
const fs = require("fs");
const { parseAMFBlacklist } = require("./lib/amf-parser");
const { analyze } = require("./lib/matcher-v2");

const REGULES = [
  { nom:"Trade Republic Bank GmbH", statut:"Agréé — établissement de paiement", source:"REGAFI" },
  { nom:"Boursorama SA", statut:"Agréé — établissement de crédit", source:"REGAFI" },
];

const csv = fs.readFileSync("./sample-data/liste-noire-amf-format-reel.csv", "utf-8");
const blacklist = parseAMFBlacklist(csv);

function simulateAPI(nom){
  const result = analyze(nom.trim(), { blacklist, regules: REGULES });
  return {
    recherche: nom.trim(),
    verdict: result.verdict,
    raison: result.raison,
    detail: result.detail,
    source: "AMF — liste noire (data.gouv.fr, Licence Ouverte 2.0)",
    nb_entites_liste_noire: blacklist.length,
  };
}

console.log("=== Simulation des réponses API de production ===\n");
["Global Capital Invest", "Trade Republic Investment", "Boursorama SA", "Truc Inexistant"].forEach(q => {
  console.log(`GET /api/verifier?nom=${encodeURIComponent(q)}`);
  console.log(JSON.stringify(simulateAPI(q), null, 2));
  console.log("");
});
