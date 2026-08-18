// lib/orias-client.js — client pour le web service SOAP ORIAS
// Contrairement a AMF/PSAN/REGAFI, ORIAS n'a pas d'export en masse : la recherche se fait
// uniquement par SIREN (voir ORIAS-NOTES.md). On resout donc le nom saisi en SIREN(s) via
// l'API gratuite et sans cle recherche-entreprises.api.gouv.fr, puis on verifie chaque SIREN
// candidat aupres d'ORIAS. Verification live par requete (pas de cache 6h comme les autres
// sources), mais tres rapide (~500ms mesures pour les deux appels).

const RECHERCHE_ENTREPRISES_URL = "https://recherche-entreprises.api.gouv.fr/search";
const ORIAS_WS_URL = "https://ws.orias.fr/ws/service/";

async function findCandidateSirens(nom, limit = 3){
  const url = `${RECHERCHE_ENTREPRISES_URL}?q=${encodeURIComponent(nom)}&limit=${limit}`;
  const r = await fetch(url);
  if(!r.ok) return [];
  const data = await r.json();
  // Défense en profondeur : un SIREN est toujours purement numérique (9 chiffres). On ne
  // fait confiance à aucune valeur qui ne respecte pas ce format avant de l'insérer dans
  // le XML envoyé à ORIAS, même si la source (API gouvernementale) est de confiance.
  return (data.results || []).map(e => e.siren).filter(s => /^\d+$/.test(String(s || "")));
}

function buildSoapRequest(userId, sirens){
  const items = sirens.map(s => `<intermediary><siren>${s}</siren></intermediary>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="urn:gpsa:orias:ws.001">
  <soapenv:Body>
    <ws:intermediarySearchRequest>
      <user>${userId}</user>
      <intermediaries>${items}</intermediaries>
    </ws:intermediarySearchRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Parseur minimal (regex) : le format de reponse est stable et entierement sous notre
// controle (on construit la requete), pas besoin d'une dependance XML complete pour ca.
function parseSoapResponse(xmlText){
  if(!xmlText || xmlText.includes("soap:Fault") || xmlText.includes("<error>")) return [];

  const out = [];
  const blocks = xmlText.split("<intermediary>").slice(1);
  for(const raw of blocks){
    const block = raw.split("</intermediary>")[0];
    if(!/<foundInRegistry>true<\/foundInRegistry>/.test(block)) continue;
    const denomMatch = block.match(/<denomination>([^<]*)<\/denomination>/);
    const estInscrit = /<status>INSCRIT<\/status>/.test(block);
    if(!denomMatch || !estInscrit) continue;
    out.push({ nom: denomMatch[1], statut: "Inscrit ORIAS (actif)", source: "ORIAS" });
  }
  return out;
}

// Renvoie [] en cas de probleme (cle absente, service indisponible...) — best-effort,
// ne doit jamais faire echouer la recherche globale.
async function fetchOriasLive(nom, userId){
  if(!userId) return [];
  try {
    const sirens = await findCandidateSirens(nom);
    if(!sirens.length) return [];
    const xml = buildSoapRequest(userId, sirens);
    const r = await fetch(ORIAS_WS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: xml,
    });
    if(!r.ok) return [];
    const text = await r.text();
    return parseSoapResponse(text);
  } catch(e){
    console.error("ORIAS indisponible:", e.message);
    return [];
  }
}

module.exports = { fetchOriasLive, findCandidateSirens, buildSoapRequest, parseSoapResponse };
