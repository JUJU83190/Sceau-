// api/rss.js — flux RSS 2.0 des dernières alertes de la liste noire AMF.
// Réutilise le même cache 6h que /api/verifier (lib/data-loader.js), aucun fetch supplémentaire.
// Exposé publiquement en /rss.xml via la réécriture définie dans vercel.json.

const { loadData } = require("../lib/data-loader");

const SITE_URL = "https://sceau-ochre.vercel.app";

function escapeXml(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" }[c]));
}

module.exports = async function handler(req, res){
  try {
    const data = await loadData();
    const entries = data.blacklist
      .filter(e => e.date_inscription)
      .slice()
      .sort((a, b) => b.date_inscription.localeCompare(a.date_inscription))
      .slice(0, 30);

    const items = entries.map(e => {
      const nom = escapeXml(e.nom);
      const categorie = escapeXml(e.categorie || "");
      const link = `${SITE_URL}/?nom=${encodeURIComponent(e.nom)}`;
      // date_inscription est au format AAAA-MM-JJ (voir lib/amf-parser.js) : minuit UTC est une
      // approximation raisonnable en l'absence d'heure précise dans la donnée source.
      const pubDate = new Date(`${e.date_inscription}T00:00:00Z`).toUTCString();
      const description = categorie
        ? `Catégorie : ${categorie}. Ajouté à la liste noire de l'AMF.`
        : "Ajouté à la liste noire de l'AMF.";
      return [
        "  <item>",
        `    <title>${nom}</title>`,
        `    <link>${link}</link>`,
        `    <guid isPermaLink="false">sceau-amf-${escapeXml(e.date_inscription)}-${nom}</guid>`,
        `    <pubDate>${pubDate}</pubDate>`,
        categorie ? `    <category>${categorie}</category>` : "",
        `    <description>${escapeXml(description)}</description>`,
        "  </item>",
      ].filter(Boolean).join("\n");
    }).join("\n");

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      "<channel>",
      "  <title>Sceau — Dernières alertes de la liste noire AMF</title>",
      `  <link>${SITE_URL}/</link>`,
      "  <description>Ajouts les plus récents à la liste noire de l'Autorité des marchés financiers (AMF), relayés par Sceau.</description>",
      "  <language>fr-fr</language>",
      `  <lastBuildDate>${new Date(data.at).toUTCString()}</lastBuildDate>`,
      items,
      "</channel>",
      "</rss>",
    ].join("\n");

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.status(200).send(xml);
  } catch(err){
    console.error("Erreur /api/rss:", err);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(503).send("Source officielle temporairement indisponible.");
  }
};
