// lib/matcher-v2.js — détection d'usurpation à 3 niveaux (corrigé)

// "bank" (EN) était déjà générique mais pas son équivalent français ni le vocabulaire
// courant des groupes bancaires mutualistes/coopératifs français ("Crédit Mutuel" vs
// "Caisse régionale de crédit agricole mutuel de la Guadeloupe" partageaient credit+mutuel
// à 100% de chevauchement alors que ce sont deux groupes concurrents distincts) ni le
// qualificatif géographique "France" (« HSBC France » collisionnait par distance avec
// « BSG FRANCE S.A. », une entité sans rapport, uniquement à cause du suffixe partagé).
const SUFFIXES_GENERIQUES = new Set(["ltd","llc","inc","sa","sas","sarl","gmbh","corp","co","com","net","org","io","fr","eu","group","holdings","limited","capital","invest","investments","trading","partners","financial","bank","banque","credit","caisse","mutuel","mutuelle","regional","regionale","france","sgp"]);

// Mémoïsation : analyze() compare la recherche à des dizaines de milliers d'entités
// (liste noire + acteurs régulés), et les mêmes chaînes reviennent à chaque requête sur
// une instance serverless "chaude" — sans cache, tokenize/normalize étaient recalculés à
// chaque comparaison (mesuré : ~500-650ms par recherche sans correspondance). Garde-fou
// anti-croissance illimitée (cache.clear() au-delà de MAX_NORM_CACHE entrées).
const MAX_NORM_CACHE = 50000;
function memoize(fn){
  const cache = new Map();
  return function(str){
    if(cache.has(str)) return cache.get(str);
    if(cache.size >= MAX_NORM_CACHE) cache.clear();
    const v = fn(str);
    cache.set(str, v);
    return v;
  };
}

function tokenizeRaw(str){ return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(Boolean); }
const tokenize = memoize(tokenizeRaw);
function coreTokensRaw(str){ const all=tokenize(str); const s=all.filter(t=>!SUFFIXES_GENERIQUES.has(t)&&t.length>1); return s.length?s:all; }
const coreTokens = memoize(coreTokensRaw);

// Normalisation stricte : garde tout sauf casse/accents/ponctuation
function strictNormalizeRaw(str){ return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,""); }
const strictNormalize = memoize(strictNormalizeRaw);
// Normalisation "coeur" : uniquement les tokens significatifs concaténés (ignore suffixes génériques)
function coreNormalizeRaw(str){ return coreTokens(str).join(""); }
const coreNormalize = memoize(coreNormalizeRaw);

function tokenOverlap(qTokens, nTokens){
  if(!qTokens.length||!nTokens.length) return 0;
  const nSet=new Set(nTokens);
  return qTokens.filter(t=>nSet.has(t)).length / Math.min(qTokens.length,nTokens.length);
}

function levenshtein(a,b){
  const m=[...Array(a.length+1)].map((_,i)=>[i,...Array(b.length).fill(0)]);
  for(let j=0;j<=b.length;j++) m[0][j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++)
    m[i][j]=Math.min(m[i-1][j]+1, m[i][j-1]+1, m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return m[a.length][b.length];
}

// Compare sur le COEUR du nom (sans suffixes génériques) pour ne pas être piégé par "GmbH", ".com" etc.
function classifyMatch(query, candidate){
  const qStrict = strictNormalize(query);
  const cStrict = strictNormalize(candidate);
  if(!qStrict || !cStrict) return { niveau:"aucun", distance:null };

  // Exact = identique sur la chaîne stricte complète
  if(qStrict === cStrict) return { niveau:"exact", distance:0 };

  const qCore = coreNormalize(query);
  const cCore = coreNormalize(candidate);

  // Exact sur le coeur = potentiellement même entité (suffixe différent) OU usurpation (mot générique ajouté)
  if(qCore && cCore && qCore === cCore){
    // Distinguer : si la query a PLUS de tokens significatifs bruts que le candidat,
    // c'est un ajout suspect (ex: "Boursorama Invest" vs "Boursorama SA") => usurpation
    const qRaw = tokenize(query).filter(t => t.length > 1);
    const cRaw = tokenize(candidate).filter(t => t.length > 1);
    const qGenericExtra = qRaw.filter(t => SUFFIXES_GENERIQUES.has(t)).length;
    const cGenericExtra = cRaw.filter(t => SUFFIXES_GENERIQUES.has(t)).length;
    // Si la query ajoute des mots génériques "de marque" (invest, capital, trading...) absents du nom officiel
    const brandLikeAdded = qRaw.some(t => ["invest","investments","capital","trading","partners","group","holdings","financial"].includes(t) && !cRaw.includes(t));
    if(brandLikeAdded) return { niveau:"usurpation", distance:1 };
    return { niveau:"exact_coeur", distance:0 };
  }

  // Distance calculée sur le coeur (pas pénalisée par les suffixes)
  const dist = (qCore && cCore) ? levenshtein(qCore, cCore) : levenshtein(qStrict, cStrict);
  const overlap = tokenOverlap(coreTokens(query), coreTokens(candidate));

  // En dessous de ~5 caractères de coeur, la distance et le chevauchement de tokens
  // ne sont plus un signal fiable (ex : "AXA" vs "act-capital.io" tombe à distance 2
  // par pur hasard sur des chaînes courtes) — on n'émet pas d'usurpation dans ce cas.
  const coreLen = Math.min(qCore.length || qStrict.length, cCore.length || cStrict.length);
  const MIN_CORE_LEN_FLOU = 5;

  const seuilDist = Math.max(2, Math.round(coreLen * 0.34));
  if(coreLen >= MIN_CORE_LEN_FLOU && (dist <= seuilDist || overlap >= 0.6)){
    return { niveau:"usurpation", distance:dist };
  }
  return { niveau:"aucun", distance:dist };
}

function analyze(query, { blacklist, regules }){
  let blMatch = null, blUsurp = null;
  for(const e of blacklist){
    const c = classifyMatch(query, e.nom);
    // Pour la LISTE NOIRE : exact OU exact_coeur = danger (même entité)
    if(c.niveau==="exact" || c.niveau==="exact_coeur"){ blMatch = e; break; }
    if(c.niveau==="usurpation" && !blUsurp) blUsurp = { entite:e, distance:c.distance };
  }

  let regExact = null, regUsurp = null;
  for(const e of regules){
    const c = classifyMatch(query, e.nom);
    if(c.niveau==="exact" || c.niveau==="exact_coeur"){ regExact = e; break; }
    if(c.niveau==="usurpation" && !regUsurp) regUsurp = { entite:e, distance:c.distance };
  }

  // Une correspondance EXACTE (ou coeur exact) avec un acteur régulé passe avant la liste noire :
  // une entité confirmée régulée ne doit pas être requalifiée "danger" par collision de coeur
  // avec un domaine d'usurpation de la liste noire (ex : "Coinhouse" vs "coinhouse-fr.com").
  if(regExact) return { verdict:"safe", raison:"regule_exact", detail:regExact };
  if(blMatch) return { verdict:"danger", raison:"liste_noire", detail:blMatch };
  if(regUsurp) return { verdict:"usurpation", raison:"proche_regule", detail:regUsurp };
  if(blUsurp) return { verdict:"usurpation", raison:"proche_liste_noire", detail:blUsurp };
  return { verdict:"inconnu", raison:"aucune_correspondance", detail:null };
}

module.exports = { classifyMatch, analyze, strictNormalize, coreNormalize, levenshtein };
