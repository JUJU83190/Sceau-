// api/verifier.js — fonction serverless PRODUCTION (Vercel)
// Sources réelles : liste noire AMF + liste blanche PSAN (data.gouv.fr)
// + registre REGAFI banque/assurance (developer.regafi.banque-france.fr, données ouvertes, sans clé API)

const { parseAMFBlacklist } = require("../lib/amf-parser");
const { parsePSAN } = require("../lib/psan-parser");
const { parseRegafi } = require("../lib/regafi-parser");
const { fetchOriasLive } = require("../lib/orias-client");
const { analyze } = require("../lib/matcher-v2");

// URLs open data officielles (Licence Ouverte 2.0)
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

// ORIAS : pas d'export en masse (voir ORIAS-NOTES.md), donc pas de cache 6h possible —
// vérification en direct à chaque recherche (nom -> SIREN via recherche-entreprises.api.gouv.fr,
// gratuit et sans clé, puis vérification du SIREN auprès d'ORIAS). Désactivé tant que
// ORIAS_USER_ID n'est pas définie (identifiant obtenu après inscription sur orias.fr,
// voir ORIAS-NOTES.md — à stocker en variable d'environnement, jamais dans le code).
const ORIAS_USER_ID = process.env.ORIAS_USER_ID || "";

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

// --- Sécurité minimale ------------------------------------------------

// Limite de fréquence en mémoire, par IP (best-effort : réinitialisée à chaque
// redémarrage d'instance serverless, ce qui suffit pour freiner le spam basique
// sans nécessiter de base de données).
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitBuckets = new Map();

function getClientIp(req){
  const fwd = req.headers?.["x-forwarded-for"];
  if(fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip){
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  if(!bucket || now > bucket.resetAt){
    rateLimitBuckets.set(ip, { count:1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_MAX;
}

// Nettoie la saisie utilisateur : retire protocole/www/slash final, espaces superflus.
function normalizeInput(raw){
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------------------

module.exports = async function handler(req, res){
  const ip = getClientIp(req);
  if(isRateLimited(ip)){
    return res.status(429).json({ error:"TROP_DE_REQUETES", message:"Trop de requêtes, réessayez dans une minute." });
  }

  // Mode "dernières alertes" pour le widget d'accueil : réutilise le même cache que les
  // recherches (pas de fetch/parse supplémentaire), pas de correspondance de nom à faire.
  if(req.query?.recentes !== undefined){
    try {
      const data = await loadData();
      const recentes = data.blacklist
        .filter(e => e.date_inscription)
        .slice()
        .sort((a, b) => b.date_inscription.localeCompare(a.date_inscription))
        .slice(0, 6)
        .map(e => ({ nom: e.nom, categorie: e.categorie, date_inscription: e.date_inscription }));
      return res.status(200).json({ recentes, date_extraction: new Date(data.at).toISOString() });
    } catch(err){
      console.error("Erreur /api/verifier?recentes:", err);
      return res.status(503).json({ error:"SOURCE_INDISPONIBLE", message:"Source officielle temporairement indisponible." });
    }
  }

  const nomBrut = req.query?.nom;
  if(!nomBrut || typeof nomBrut !== "string"){
    return res.status(400).json({ error:"PARAMETRE_MANQUANT", message:"Paramètre 'nom' requis (2 caractères min)." });
  }
  const nom = normalizeInput(nomBrut);
  if(nom.length < 2){
    return res.status(400).json({ error:"PARAMETRE_INVALIDE", message:"Paramètre 'nom' requis (2 caractères min)." });
  }

  try {
    const data = await loadData();
    const orias = await fetchOriasLive(nom, ORIAS_USER_ID);
    const regules = orias.length ? [...data.regules, ...orias] : data.regules;

    const result = analyze(nom, { blacklist:data.blacklist, regules });
    res.status(200).json({
      recherche: nom,
      verdict: result.verdict,
      raison: result.raison,
      detail: result.detail,
      sources: [
        "AMF liste noire",
        "AMF liste blanche PSAN",
        data.regafiEnDirect ? "REGAFI (données ouvertes ACPR)" : "REGAFI (noyau de secours)",
        ...(ORIAS_USER_ID ? ["ORIAS (vérification en direct)"] : []),
      ],
      date_extraction: new Date(data.at).toISOString(),
      stats: {
        entites_liste_noire: data.blacklist.length,
        prestataires_psan: data.nbPsan || 0,
        entites_regafi: data.nbRegafi || 0,
      },
      avertissement: "Information relayée à titre indicatif, ne constitue pas un conseil en investissement. Vérifiez sur regafi.fr / amf-france.org."
    });
  } catch(err){
    console.error("Erreur /api/verifier:", err);
    res.status(503).json({ error:"SOURCE_INDISPONIBLE", message:"Source officielle temporairement indisponible. Réessayez plus tard." });
  }
};
