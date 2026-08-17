# ORIAS — état des lieux et recommandation

## Ce que j'ai vérifié

- **Pas d'open data pur.** Contrairement à l'AMF, il n'existe aucun jeu de données ORIAS téléchargeable sans compte sur data.gouv.fr ou ailleurs.
- **Seule option officielle : un web service SOAP** (`https://ws.orias.fr/service?wsdl`). Deux limites structurelles importantes :
  1. **La recherche se fait par SIREN ou numéro d'immatriculation ORIAS — pas par nom d'entreprise.** Or Sceau reçoit une saisie utilisateur en texte libre (un nom). Brancher ORIAS suppose donc de résoudre d'abord *nom → SIREN* via une autre source (ex. API Sirene de l'INSEE), ce qui ajoute une dépendance et une source d'erreur supplémentaires avant même d'interroger ORIAS.
  2. **L'inscription au web service n'est pas un simple compte développeur en libre-service** comme pour REGAFI : le formulaire (`orias.fr/webService/inscription`) demande la dénomination, le SIREN et le numéro ORIAS *du demandeur lui-même* — ça suppose d'être déjà un professionnel identifié, pas juste un développeur curieux. Le délai/processus d'approbation n'est pas documenté publiquement.
- **Solutions tierces existantes (BrokPass, orias.rest, etc.)** : non retenues, conformément à ta consigne — ce sont des services non officiels, donc une dépendance de fiabilité/juridique supplémentaire que tu n'as pas validée.

## Complexité estimée si tu veux quand même le faire

- Résolution nom → SIREN (API Sirene INSEE, gratuite et ouverte celle-là) : ~1-2h de dev.
- Inscription + attente d'approbation ORIAS : délai hors de notre contrôle, potentiellement plusieurs jours.
- Client SOAP en JS (le web service n'est pas REST/JSON) : quelques heures, mais une brique technique de plus à maintenir pour un seul registre.
- Au total : probablement le plus gros morceau des 3 registres (AMF/REGAFI/ORIAS) en temps de dev, pour un registre qui **complète** REGAFI sans le remplacer (deux populations différentes : réseau bancaire vs intermédiaires assurance/courtage).

## Recommandation

Reporter ORIAS à une itération ultérieure. Pas de noyau de secours "ORIAS_NOYAU" ajouté dans le code pour l'instant : je préfère ne pas inventer une liste de quelques intermédiaires "vérifiés" à la main, faute de pouvoir garantir leur statut réel à cette date — un faux "safe" serait pire qu'une absence de données sur ce registre. Si tu veux un noyau minimal malgré tout, donne-moi 2-3 noms d'intermédiaires ORIAS que tu as toi-même vérifiés sur orias.fr et je les ajoute à l'identique du modèle `REGAFI_NOYAU`.
