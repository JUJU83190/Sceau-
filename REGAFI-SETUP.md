# REGAFI — Activer l'API officielle (optionnel)

Le projet fonctionne dès aujourd'hui **sans** cette étape, grâce à un noyau statique (`REGAFI_NOYAU` dans `api/verifier.js`, 3 entités : Trade Republic, Boursorama, Fortuneo). Cette page documente comment brancher la vraie API REGAFI quand tu auras le temps de t'en occuper.

## Pourquoi ce n'est pas déjà branché

Contrairement à l'AMF (CSV ouvert, sans compte), REGAFI (registre des agents financiers, ACPR/Banque de France) n'expose ses données que via une API qui nécessite une inscription développeur.

## Étapes pour toi

1. Va sur **https://developer.regafi.banque-france.fr**
2. Crée un compte développeur (gratuit) : `developer.regafi.banque-france.fr/user/register`
3. Une fois connecté, va dans le catalogue d'API, souscris au produit **REGAFI FR** (ou **REGAFI EN** si tu préfères les réponses en anglais)
4. Choisis un plan — le plan par défaut (100 appels/heure) suffit largement pour ce projet
5. Récupère ta **clé d'application** (API key / client ID) depuis ton tableau de bord développeur
6. Une fois connecté, consulte la documentation de l'API dans le portail (elle n'est pas visible publiquement sans compte) pour confirmer :
   - le chemin exact de l'endpoint de recherche par dénomination sociale
   - le nom exact de l'en-tête d'authentification attendu (probablement `X-IBM-Client-Id`, à confirmer)
   - les noms des champs de la réponse JSON (le code actuel suppose `registered_name`, à ajuster si différent)

## Comment activer côté code

Le code d'appel existe déjà dans `api/verifier.js` (fonction `fetchRegafiLive`), désactivé par défaut. Pour l'activer :

1. Ajoute une variable d'environnement `REGAFI_API_KEY` avec ta clé :
   - En local : crée un fichier `.env.local` (non commité) avec `REGAFI_API_KEY=ta_cle_ici`, ou exporte la variable dans ton shell.
   - Sur Vercel : Project Settings → Environment Variables → ajoute `REGAFI_API_KEY`.
2. Si l'URL de l'endpoint (`REGAFI_API_URL`) ou le mapping des champs de réponse diffèrent de ce que tu as trouvé à l'étape 6 ci-dessus, ajuste-les directement dans `api/verifier.js` (section clairement commentée `--- REGAFI (désactivé par défaut) ---`).
3. Tant que `REGAFI_API_KEY` n'est pas définie, rien ne change : le noyau statique continue de faire foi, aucun risque de casser le reste de l'app.

## Ce que ça ajoute une fois actif

Chaque recherche interroge en direct l'API REGAFI par dénomination, en complément du noyau statique (pas en remplacement) — donc même en cas de panne de l'API REGAFI, le noyau reste disponible en repli.
