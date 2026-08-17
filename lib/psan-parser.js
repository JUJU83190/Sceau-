// lib/psan-parser.js — parseur de la liste blanche PSAN (open data AMF)
// Réutilise les helpers du parseur AMF (même format ; séparateur, colonnes nommées)
const { splitCSVLine, findColumn } = require("./amf-parser");

function isApprouve(statutRaw){
  const s = statutRaw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s === "agree";
}

function parsePSAN(csvText){
  const clean = csvText.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  const lines = clean.split("\n").filter(l => l.trim().length > 0);
  if(lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const idxNom = findColumn(headers, ["entite_nom", "denomination", "nom", "raison_sociale"]);
  const idxNum = findColumn(headers, ["no_amf", "numero", "numero_amf"]);
  const idxForme = findColumn(headers, ["forme_juridique", "forme"]);
  const idxPays = findColumn(headers, ["pays_siege", "pays"]);
  const idxUrl = findColumn(headers, ["site_internet", "url", "site"]);
  // Le fichier reel a une ligne par activite declaree par entite, avec un statut
  // "Agree" ou "Radie" (ex : caducite pour agrement MiCA, arret d'activite...).
  // On ne garde que les lignes "Agree" pour ne pas certifier un prestataire radie.
  const idxStatut = findColumn(headers, ["statut"]);

  const seen = new Set();
  const rows = [];
  for(let i = 1; i < lines.length; i++){
    const cols = splitCSVLine(lines[i]);
    const nom = (idxNom >= 0 ? cols[idxNom] : "")?.trim() || "";
    if(!nom) continue;
    if(idxStatut >= 0 && !isApprouve((cols[idxStatut] || "").trim())) continue;
    if(seen.has(nom)) continue;
    seen.add(nom);
    rows.push({
      nom,
      no_amf: (idxNum >= 0 ? cols[idxNum] : "")?.trim() || "",
      forme_juridique: (idxForme >= 0 ? cols[idxForme] : "")?.trim() || "",
      pays_siege: (idxPays >= 0 ? cols[idxPays] : "")?.trim() || "",
      site_internet: (idxUrl >= 0 ? cols[idxUrl] : "")?.trim() || "",
      statut: "Enregistré PSAN (liste blanche AMF)",
    });
  }
  return rows;
}

module.exports = { parsePSAN };
