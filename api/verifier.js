// api/verifier.js — fonction serverless PRODUCTION (Vercel)
// Sources réelles : liste noire AMF + liste blanche PSAN (data.gouv.fr)
// + registre REGAFI banque/assurance (developer.regafi.banque-france.fr, données ouvertes, sans clé API)

const { loadData } = require("../lib/data-loader");
const { fetchOriasLive } = require("../lib/orias-client");
const { analyze } = require("../lib/matcher-v2");

// ORIAS : pas d'export en masse (voir ORIAS-NOTES.md), donc pas de cache 6h possible —
// vérification en direct à chaque recherche (nom -> SIREN via recherche-entreprises.api.gouv.fr,
// gratuit et sans clé, puis vérification du SIREN auprès d'ORIAS). Désactivé tant que
// ORIAS_USER_ID n'est pas définie (identifiant obtenu après inscription sur orias.fr,
// voir ORIAS-NOTES.md — à stocker en variable d'environnement, jamais dans le code).
const ORIAS_USER_ID = process.env.ORIAS_USER_ID || "";

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
  // Plafond haut : analyze() compare la requête à ~30 000 entités via une distance de
  // Levenshtein (coût proportionnel à la longueur des deux chaînes) — sans limite, une
  // requête de plusieurs dizaines de milliers de caractères pourrait saturer l'instance.
  if(nom.length < 2 || nom.length > 200){
    return res.status(400).json({ error:"PARAMETRE_INVALIDE", message:"Paramètre 'nom' requis (2 à 200 caractères)." });
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
      avertissement: "Information relayée à titre indicatif, ne constitue pas un conseil en investissement. Vérifiez sur amf-france.org, regafi.fr ou orias.fr."
    });
  } catch(err){
    console.error("Erreur /api/verifier:", err);
    res.status(503).json({ error:"SOURCE_INDISPONIBLE", message:"Source officielle temporairement indisponible. Réessayez plus tard." });
  }
};
