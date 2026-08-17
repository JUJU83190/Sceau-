// api/verifier.js — fonction serverless PRODUCTION (Vercel)
// Sources réelles : liste noire AMF + liste blanche PSAN (open data data.gouv.fr)
// + noyau REGAFI en dur, remplaçable par l'API REGAFI officielle (voir REGAFI-SETUP.md)

const { parseAMFBlacklist } = require("../lib/amf-parser");
const { parsePSAN } = require("../lib/psan-parser");
const { analyze } = require("../lib/matcher-v2");

// URLs open data officielles (Licence Ouverte 2.0)
const URL_LISTE_NOIRE = "https://www.data.gouv.fr/api/1/datasets/r/d2d9df6d-1cd2-41a8-96f5-684cb3057ecb";
const URL_PSAN = "https://www.data.gouv.fr/api/1/datasets/r/e03f8899-2499-4826-aaae-6842f520bdac";

// Noyau régulé provisoire (à remplacer/compléter par l'API REGAFI une fois REGAFI_API_KEY configurée)
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

// --- REGAFI (désactivé par défaut) --------------------------------------
// Nécessite un compte + une clé API sur developer.regafi.banque-france.fr
// (inscription gratuite, voir REGAFI-SETUP.md pour la procédure complète).
// Tant que REGAFI_API_KEY n'est pas définie, le noyau statique REGAFI_NOYAU
// ci-dessus fait office de repli — le reste de l'application fonctionne
// normalement sans cette clé.
const REGAFI_API_KEY = process.env.REGAFI_API_KEY || "";
// TODO(après inscription) : confirmer le chemin exact de l'endpoint de recherche
// par dénomination et le nom de l'en-tête d'authentification dans la doc du
// portail (visible uniquement une fois connecté) et ajuster REGAFI_API_URL /
// le mapping ci-dessous en conséquence.
const REGAFI_API_URL = "https://developer.regafi.banque-france.fr/api-fr/regafi/v1/etablissements";

async function fetchRegafiLive(query){
  if(!REGAFI_API_KEY) return null;
  try {
    const url = `${REGAFI_API_URL}?denomination=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { "X-IBM-Client-Id": REGAFI_API_KEY } });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = Array.isArray(data) ? data : (data.items || data.results || []);
    // Mapping provisoire : à ajuster selon les champs réels de la réponse REGAFI.
    return items.map(e => ({
      nom: e.registered_name || e.denomination || e.nom || "",
      statut: "Agréé (REGAFI)",
      source: "REGAFI",
    })).filter(e => e.nom);
  } catch(e){
    console.error("REGAFI indisponible, repli sur le noyau statique:", e.message);
    return null;
  }
}
// --------------------------------------------------------------------------

async function loadData(){
  const now = Date.now();
  if(cache.blacklist && now - cache.at < CACHE_MS) return cache;

  // Liste noire (obligatoire)
  const blacklist = parseAMFBlacklist(await fetchText(URL_LISTE_NOIRE));

  // PSAN (best-effort : si indisponible, on continue sans planter)
  let psan = [];
  try { psan = parsePSAN(await fetchText(URL_PSAN)); } catch(e){ psan = []; }

  const regules = [
    ...REGAFI_NOYAU,
    ...psan.map(p => ({ nom:p.nom, statut:p.statut, source:"PSAN (AMF)" }))
  ];

  cache = { blacklist, regules, at:now, nbPsan:psan.length };
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
    const regafiLive = await fetchRegafiLive(nom);
    const regules = regafiLive ? [...data.regules, ...regafiLive] : data.regules;

    const result = analyze(nom, { blacklist:data.blacklist, regules });
    res.status(200).json({
      recherche: nom,
      verdict: result.verdict,
      raison: result.raison,
      detail: result.detail,
      sources: [
        "AMF liste noire",
        "AMF liste blanche PSAN",
        regafiLive ? "REGAFI (API officielle)" : "REGAFI (noyau provisoire)",
      ],
      date_extraction: new Date(data.at).toISOString(),
      stats: { entites_liste_noire: data.blacklist.length, prestataires_psan: data.nbPsan || 0 },
      avertissement: "Information relayée à titre indicatif, ne constitue pas un conseil en investissement. Vérifiez sur regafi.fr / amf-france.org."
    });
  } catch(err){
    console.error("Erreur /api/verifier:", err);
    res.status(503).json({ error:"SOURCE_INDISPONIBLE", message:"Source officielle temporairement indisponible. Réessayez plus tard." });
  }
};
