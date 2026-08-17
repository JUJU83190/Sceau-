// lib/regafi-parser.js — parseur du registre REGAFI (ACPR / Banque de France)
// Donnees ouvertes, sans cle API : catalogue-banque + catalogue-assurance sur le portail
// OpenDataSoft developer.regafi.banque-france.fr. On ne recupere que les colonnes legeres
// (denomination, siren, forme_juridique, categorie) via ?select=... — le CSV complet
// depasse 200 Mo a cause de colonnes JSON imbriquees (autorisations, passeports...) inutiles ici.
//
// Parseur CSV caractere-par-caractere (pas un simple split par ligne comme amf-parser.js) car
// certains champs texte du fichier complet contiennent des retours a la ligne dans les guillemets ;
// on reste prudent meme sur la version allegee.

function parseCSVRecords(text, delimiter){
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === delimiter){ row.push(field); field = ""; }
      else if(c === '\r'){ /* ignore */ }
      else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}

// Le registre REGAFI ne liste que les agents actuellement actifs (pas d'equivalent du
// statut "Radie" de la liste PSAN) : toute ligne presente est une entite agreee.
function parseRegafi(csvText, { source = "REGAFI" } = {}){
  const clean = csvText.replace(/^﻿/, "");
  const rows = parseCSVRecords(clean, ";");
  if(rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idxNom = headers.indexOf("denomination");
  const idxForme = headers.indexOf("forme_juridique");
  const idxCategorie = headers.indexOf("categorie");
  const idxSiren = headers.indexOf("siren");
  if(idxNom < 0) return [];

  const out = [];
  for(let i = 1; i < rows.length; i++){
    const cols = rows[i];
    const nom = (cols[idxNom] || "").trim();
    if(!nom) continue;
    const categorie = idxCategorie >= 0 ? (cols[idxCategorie] || "").trim() : "";
    out.push({
      nom,
      statut: categorie ? `Agréé — ${categorie}` : "Agréé (REGAFI)",
      forme_juridique: idxForme >= 0 ? (cols[idxForme] || "").trim() : "",
      siren: idxSiren >= 0 ? (cols[idxSiren] || "").trim() : "",
      source,
    });
  }
  return out;
}

module.exports = { parseRegafi, parseCSVRecords };
