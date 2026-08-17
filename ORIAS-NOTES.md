# ORIAS — branché (2026-08-17)

**Mise à jour : ce document contredit sa version précédente**, qui concluait qu'ORIAS était hors de portée sans être soi-même un professionnel immatriculé. L'inscription a finalement abouti (voir historique de conversation) et l'intégration est fonctionnelle.

## Comment ça marche

Contrairement à AMF/PSAN/REGAFI, ORIAS n'a pas d'export en masse : le web service (SOAP) ne recherche que par SIREN, pas par nom. `lib/orias-client.js` fait donc deux appels **en direct à chaque recherche** (pas de cache 6h possible) :

1. **`recherche-entreprises.api.gouv.fr`** (API publique gouvernementale, gratuite, sans clé) : résout le nom saisi en 1 à 3 SIREN candidats.
2. **Web service SOAP ORIAS** (`ws.orias.fr/ws/service/`) : vérifie si chaque SIREN candidat est inscrit et actif (statut `INSCRIT`) sur le registre.

Mesuré en conditions réelles : ~550ms pour les deux appels combinés — largement dans les temps.

## Activation

Nécessite la variable d'environnement `ORIAS_USER_ID` (l'identifiant reçu par e-mail après activation du web service sur orias.fr). **Cette valeur n'est stockée nulle part dans le code ni dans ce dépôt** — à ajouter uniquement dans Vercel : Project Settings → Environment Variables → `ORIAS_USER_ID`.

Tant que la variable n'est pas définie, `fetchOriasLive` renvoie systématiquement un tableau vide sans appeler aucune API — le reste de l'application fonctionne normalement sans ORIAS.

## Vérifié en conditions réelles

Recherche "Verspieren" (courtier d'assurance connu) → SIREN 321502049 trouvé via l'API gouvernementale → confirmé inscrit ORIAS (COA + MA + MIOBSP, statut INSCRIT) → verdict "safe".

## Limite connue

Le rapprochement nom → SIREN utilise le moteur de recherche textuelle de `recherche-entreprises.api.gouv.fr`, pas notre propre logique de correspondance. Si le nom saisi est trop approximatif pour que cette API renvoie le bon SIREN en tête de liste, ORIAS ne sera pas interrogé pour la bonne entité — dans ce cas, la recherche retombe simplement sur les autres sources (AMF, PSAN, REGAFI) sans casser quoi que ce soit.

## À ne pas faire

Le service tiers `orias.rest` (ou équivalents non officiels) reste explicitement écarté, conformément à la consigne d'origine — cette intégration n'utilise que des sources officielles (ORIAS lui-même + l'API gouvernementale recherche-entreprises).
