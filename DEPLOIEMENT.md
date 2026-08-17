# Sceau — État du projet (2026-08-15)

## ✅ Nettoyage
- Suppression du moteur v1 devenu redondant : `lib/matcher.js`, `test.js`, `test-edge-cases.js`, ainsi que `sample-data/liste-noire-amf-sample.csv` (n'était utilisé que par ces tests). Seul `lib/matcher-v2.js` reste comme moteur de référence.
- `api/verifier.js` uniformisé en CommonJS (`module.exports`), cohérent avec le reste du projet — s'exécute sans erreur en local (`node`) et reste compatible Vercel.
- `package.json` : script `test` mis à jour pour lancer toute la suite restante, et nouveau script `dev` (voir plus bas).

## ✅ Sources branchées avec de vraies URLs
- **Liste noire AMF** : `https://www.data.gouv.fr/api/1/datasets/r/d2d9df6d-1cd2-41a8-96f5-684cb3057ecb` — vérifiée en conditions réelles (3396 entités). Le format réel diffère de l'ancien fichier d'exemple du projet : 3 colonnes seulement (`nom;categorie;date_inscription`), pas de colonne URL séparée — `sample-data/liste-noire-amf-format-reel.csv` corrigé en conséquence (le parseur gérait déjà ce cas, aucun changement de code nécessaire).
- **PSAN (liste blanche AMF)** : `https://www.data.gouv.fr/api/1/datasets/r/e03f8899-2499-4826-aaae-6842f520bdac` — vérifiée (1110 lignes réelles → 187 entités actuellement `Agréé`). Le fichier réel a une ligne par activité déclarée avec un statut `Agréé`/`Radié` (transition PSAN → MiCA au 30/06/2026) ; `lib/psan-parser.js` filtre sur `Agréé` et déduplique par entité.

## 🐛 Bugs avérés corrigés sur les vraies données (`lib/matcher-v2.js`)
1. **"Coinhouse" classé "danger"** : la liste noire contient `coinhouse-fr.com` (une usurpation de Coinhouse listée par l'AMF), et le cœur du nom collisionnait avec le vrai Coinhouse (PSAN régulé). Corrigé : une correspondance exacte avec un acteur régulé est vérifiée **avant** la liste noire.
2. **Faux "usurpation" sur noms courts légitimes** (AXA, N26, LCL...) : le seuil de similarité était trop permissif sous ~5 caractères de cœur de nom (ex. "AXA" vs "act-capital.io" tombait à distance 2 par hasard). Corrigé avec ton accord : la comparaison floue (distance/chevauchement) est désormais ignorée en dessous de ce seuil.

Les 4 suites de tests existantes passent à l'identique après ces deux correctifs (aucune régression). Résidu documenté et accepté : quelques cas ambigus persistent sur des marques ayant une filiale régulée au nom proche mais non identique (ex. "Revolut" vs "REVOLUT DIGITAL ASSETS EUROPE LTD" → toujours classé "usurpation" plutôt que "safe") — non corrigé, hors du périmètre du correctif validé.

## 🔐 Sécurité minimale ajoutée (testée)
- Rate limiting en mémoire, 30 req/min par IP.
- Normalisation de la saisie (retrait `https://`, `www.`, espaces superflus) avant matching.
- Erreurs serveur génériques côté client (plus de détail technique exposé ; erreur complète loggée côté serveur uniquement).

## ⏸️ REGAFI — structure prête, désactivée par défaut
Voir [REGAFI-SETUP.md](REGAFI-SETUP.md) pour la procédure d'inscription et d'activation (variable d'env `REGAFI_API_KEY`). Le noyau statique `REGAFI_NOYAU` fait foi en attendant.

## ⏸️ ORIAS — reporté
Voir [ORIAS-NOTES.md](ORIAS-NOTES.md) : pas d'open data pur, web service SOAP interrogeable par SIREN uniquement (pas par nom), inscription nécessitant déjà une identité professionnelle. Pas de noyau de secours fabriqué (risque de faux "safe").

## ✅ Front-end (`public/`)
Page d'accueil (`index.html`) connectée à `/api/verifier`, gère les 4 verdicts (safe/danger/usurpation/inconnu) avec source + date de mise à jour affichées, avertissement financier, lien de signalement par e-mail, footer conforme. Testée en local avec de vraies données (les 4 verdicts vérifiés dans un navigateur réel). Aucun cookie, aucun tracker.

## ✅ Pages légales (`public/`)
`mentions-legales.html`, `cgu.html`, `confidentialite.html`, `disclaimer.html` — rédigées à partir de zéro (les fichiers sources mentionnés n'ont pas été retrouvés sur cette machine). La clause CGU centrale (pas un CIF, information factuelle datée, sans garantie d'exhaustivité) y figure explicitement.

⚠️ **Avant mise en ligne**, il reste des champs `[À COMPLÉTER]` que je ne pouvais pas inventer (identité réelle) :
- `mentions-legales.html` : nom/raison sociale de l'éditeur, statut, adresse postale, e-mail de contact, directeur de publication.
- `confidentialite.html` : e-mail de contact.
- `index.html` : l'adresse e-mail du lien "Signaler une erreur" est un placeholder (`signalement@A-COMPLETER.exemple`) à remplacer par ta vraie adresse.

## 🧪 Tester en local avant déploiement
```
npm run dev
```
Lance un petit serveur de dev sans dépendance (`dev-server.js`) qui sert `public/` et route `/api/verifier` vers le vrai handler — ouvre `http://localhost:3000`.

## 🚀 Ce qu'il reste à faire pour un déploiement Vercel gratuit
1. Remplir les champs `[À COMPLÉTER]` ci-dessus (identité éditeur + e-mail de contact/signalement).
2. Créer un compte GitHub (gratuit) + un compte Vercel (connexion via GitHub) — si pas déjà fait.
3. Pousser ce dossier `sceau-app/` sur un repo GitHub.
4. Sur Vercel : "Import Project" → sélectionner le repo → Deploy (aucune configuration nécessaire, Vercel détecte `api/verifier.js` et sert `public/` automatiquement).
5. Vérifier en ligne : `https://ton-projet.vercel.app/api/verifier?nom=Boursorama` → doit renvoyer `"verdict": "safe"`, puis tester la page d'accueil elle-même.

Je n'ai déployé ni poussé de code sur GitHub — à confirmer explicitement le moment venu.

## 💶 Coût
0 € pour démarrer (Vercel gratuit + open data gratuit). Un nom de domaine (~12€/an) est optionnel.

## ⚖️ Rappel
Version gratuite, non commerciale, à but d'information. Formulation prudente des verdicts (jamais d'accusation définitive). Renvoi systématique vers les sources officielles.
