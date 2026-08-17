// lib/amf-parser.js — parseur robuste du vrai format CSV de la liste noire AMF
// Gère : BOM UTF-8, séparateur ";", colonnes nommées (ordre variable), guillemets, lignes vides

function parseAMFBlacklist(csvText){
  const clean = csvText.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  const lines = clean.split("\n").filter(l => l.trim().length > 0);
  if(lines.length < 2) return [];

  // En-tête : on repère les colonnes par leur nom (robuste au changement d'ordre)
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  // On cherche les index des colonnes qui nous intéressent, avec plusieurs noms possibles
  const idxNom = findColumn(headers, ["denomination", "dénomination", "offre_nom", "nom", "raison_sociale"]);
  const idxUrl = findColumn(headers, ["url", "url_offre", "site", "adresse"]);
  const idxCat = findColumn(headers, ["categorie", "catégorie", "theme", "type"]);
  const idxDate = findColumn(headers, ["date_ajout", "date_enregistrement", "date_inscription", "date"]);

  const rows = [];
  for(let i = 1; i < lines.length; i++){
    const cols = splitCSVLine(lines[i]);
    const nom = (idxNom >= 0 ? cols[idxNom] : "")?.trim() || "";
    const url = (idxUrl >= 0 ? cols[idxUrl] : "")?.trim() || "";
    // Si pas de dénomination mais une URL, on utilise l'URL comme nom (fréquent dans les listes noires)
    const nomFinal = nom || url;
    if(!nomFinal) continue;
    rows.push({
      nom: nomFinal,
      url: url,
      categorie: (idxCat >= 0 ? cols[idxCat] : "")?.trim() || "Non précisé",
      date_inscription: (idxDate >= 0 ? cols[idxDate] : "")?.trim() || "",
    });
  }
  return rows;
}

// Gère les champs entre guillemets contenant des points-virgules
function splitCSVLine(line){
  const result = [];
  let cur = "", inQuotes = false;
  for(let i = 0; i < line.length; i++){
    const c = line[i];
    if(c === '"'){ inQuotes = !inQuotes; }
    else if(c === ';' && !inQuotes){ result.push(cur); cur = ""; }
    else { cur += c; }
  }
  result.push(cur);
  return result.map(s => s.replace(/^"|"$/g, ""));
}

function findColumn(headers, candidates){
  for(const cand of candidates){
    const idx = headers.indexOf(cand);
    if(idx >= 0) return idx;
  }
  return -1;
}

module.exports = { parseAMFBlacklist, splitCSVLine, findColumn };
