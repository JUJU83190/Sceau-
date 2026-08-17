// dev-server.js — serveur de développement minimal, sans dépendance.
// Sert public/ en statique et route /api/verifier vers le handler serverless,
// pour tester le front-end connecté à l'API réelle en local avant déploiement Vercel.
// Usage : node dev-server.js  (puis ouvrir http://localhost:3000)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const verifier = require("./api/verifier");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

function serveStatic(pathname, res){
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if(!fullPath.startsWith(PUBLIC_DIR)){
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(fullPath, (err, data) => {
    if(err){
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Page introuvable");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fullPath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if(url.pathname === "/api/verifier"){
    const query = Object.fromEntries(url.searchParams.entries());
    const mockRes = {
      _status: 200,
      status(code){ this._status = code; return this; },
      json(obj){
        res.writeHead(this._status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(obj));
      },
    };
    try {
      await verifier({ query, headers: req.headers, socket: req.socket }, mockRes);
    } catch(err){
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "ERREUR_SERVEUR", message: "Erreur interne (voir logs du serveur de dev)." }));
    }
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(PORT, () => console.log(`Sceau (dev) -> http://localhost:${PORT}`));
