// lib/data-loader.js — chargement + cache 6h des sources ouvertes (AMF, PSAN, REGAFI).
// Extrait de api/verifier.js pour être partagé avec api/rss.js sans dupliquer le fetch/parse.

const { parseAMFBlacklist } = require("./amf-parser");
const { parsePSAN } = require("./psan-parser");
const { parseRegafi } = require("./regafi-parser");

const URL_LISTE_NOIRE = "https://www.data.gouv.fr/api/1/datasets/r/d2d9df6d-1cd2-41a8-96f5-684cb3057ecb";
const URL_PSAN = "https://www.data.gouv.fr/api/1/datasets/r/e03f8899-2499-4826-aaae-6842f520bdac";

// REGAFI (ACPR/Banque de France) : portail OpenDataSoft, aucune clé requise.
// ?select=... limite l'export aux colonnes utiles (le CSV complet dépasse 200 Mo à cause
// de colonnes JSON imbriquées — autorisations, passeports... — inutiles pour Sceau).
const URL_REGAFI_BANQUE = "https://developer.regafi.banque-france.fr/api/explore/v2.1/catalog/datasets/catalogue-banque/exports/csv?select=denomination,siren,forme_juridique,categorie";
const URL_REGAFI_ASSURANCE = "https://developer.regafi.banque-france.fr/api/explore/v2.1/catalog/datasets/catalogue-assurance/exports/csv?select=denomination,siren,forme_juridique,categorie";

// Noyau de secours, utilisé uniquement si le fetch REGAFI échoue (voir loadData).
const REGAFI_NOYAU = [
  { nom:"Trade Republic Bank GmbH", statut:"Agréé — établissement de paiement", source:"REGAFI" },
  { nom:"Boursorama SA", statut:"Agréé — établissement de crédit", source:"REGAFI" },
  { nom:"Fortuneo", statut:"Agréé — établissement de crédit", source:"REGAFI" },
];

let cache = { blacklist:null, regules:null, at:0 };
const CACHE_MS = 6*60*60*1000;

async function fetchText(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return r.text();
}

async function loadData(){
  const now = Date.now();
  if(cache.blacklist && now - cache.at < CACHE_MS) return cache;

  // Les 4 sources sont récupérées en parallèle (et non l'une après l'autre) pour rester
  // confortablement sous la limite d'exécution de 10s des fonctions Vercel Hobby.
  const [blacklistRes, psanRes, regafiBanqueRes, regafiAssuranceRes] = await Promise.allSettled([
    fetchText(URL_LISTE_NOIRE),
    fetchText(URL_PSAN),
    fetchText(URL_REGAFI_BANQUE),
    fetchText(URL_REGAFI_ASSURANCE),
  ]);

  // Liste noire (obligatoire)
  if(blacklistRes.status !== "fulfilled") throw new Error("Liste noire AMF indisponible : " + blacklistRes.reason?.message);
  const blacklist = parseAMFBlacklist(blacklistRes.value);

  // PSAN (best-effort : si indisponible, on continue sans planter)
  let psan = [];
  if(psanRes.status === "fulfilled"){
    try { psan = parsePSAN(psanRes.value); } catch(e){ psan = []; }
  }

  // REGAFI (best-effort). Le noyau statique reste toujours fusionné en complément (pas
  // seulement en repli) : certaines marques connues (ex. Fortuneo) sont enregistrées sous
  // leur nom légal officiel (Arkéa Direct Bank) plutôt que leur nom commercial, donc ne
  // matchent pas forcément dans les données REGAFI même quand elles sont disponibles.
  let regafiLive = [], regafiEnDirect = false;
  if(regafiBanqueRes.status === "fulfilled" && regafiAssuranceRes.status === "fulfilled"){
    try {
      regafiLive = [
        ...parseRegafi(regafiBanqueRes.value, { source: "REGAFI (banque)" }),
        ...parseRegafi(regafiAssuranceRes.value, { source: "REGAFI (assurance)" }),
      ];
      regafiEnDirect = true;
    } catch(e){
      console.error("Erreur de parsing REGAFI :", e.message);
    }
  } else {
    console.error("REGAFI (données ouvertes) indisponible, le noyau statique reste actif en complément");
  }
  const regafi = [...regafiLive, ...REGAFI_NOYAU];

  const regules = [
    ...regafi,
    ...psan.map(p => ({ nom:p.nom, statut:p.statut, source:"PSAN (AMF)" }))
  ];

  cache = { blacklist, regules, at:now, nbPsan:psan.length, nbRegafi:regafi.length, regafiEnDirect };
  return cache;
}

module.exports = { loadData };
