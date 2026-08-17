const { analyze } = require("./lib/matcher-v2.js");

const DATA = {
  blacklist: [
    { nom:"global-capital-invest.com", categorie:"Forex" },
    { nom:"cryptoprime-trading.net", categorie:"Crypto-actifs" },
  ],
  regules: [
    { nom:"Trade Republic Bank GmbH", statut:"Agréé paiement" },
    { nom:"Boursorama SA", statut:"Agréé crédit" },
  ]
};

let pass=0, fail=0;
function t(label, query, expectedVerdict){
  const r = analyze(query, DATA);
  const ok = r.verdict === expectedVerdict;
  if(ok){ pass++; console.log(`✅ ${label} → ${r.verdict} (${r.raison})`); }
  else { fail++; console.log(`❌ ${label} → obtenu "${r.verdict}" (${r.raison}), attendu "${expectedVerdict}"`); }
}

console.log("=== Cas légitimes (exact) ===");
t("Trade Republic Bank GmbH (exact)", "Trade Republic Bank GmbH", "safe");
t("Boursorama SA (exact)", "Boursorama SA", "safe");

console.log("\n=== USURPATIONS (le coeur du sujet) ===");
t("Trade Republic Investment (usurpation)", "Trade Republic Investment", "usurpation");
t("Trade Republik Bank (faute volontaire)", "Trade Republik Bank", "usurpation");
t("Boursorama Invest (usurpation)", "Boursorama Invest", "usurpation");
t("Bourssorama SA (lettre en trop)", "Bourssorama SA", "usurpation");

console.log("\n=== Liste noire exacte ===");
t("global-capital-invest.com (liste noire)", "global-capital-invest.com", "danger");
t("Global Capital Invest (liste noire variante)", "Global Capital Invest", "danger");

console.log("\n=== Inconnu (ni régulé ni blacklist) ===");
t("Ma Petite Boulangerie", "Ma Petite Boulangerie", "inconnu");
t("XYZ Random Corp", "XYZ Random Corp", "inconnu");

console.log(`\n=== ${pass} réussis / ${fail} échoués ===`);
