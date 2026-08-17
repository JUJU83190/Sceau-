# REGAFI — branché, aucune inscription nécessaire

**Mise à jour du 2026-08-17 : ce document est obsolète dans sa version précédente.** En creusant pour activer REGAFI, il s'est avéré que le portail `developer.regafi.banque-france.fr` expose en réalité les registres banque et assurance en **données ouvertes**, comme l'AMF — pas besoin de compte ni de clé API.

## Ce qui est branché

`api/verifier.js` télécharge et met en cache (6h, comme AMF/PSAN) :
- Le registre bancaire REGAFI (`catalogue-banque`, ~25 500 entités)
- Le registre assurance REGAFI (`catalogue-assurance`, ~1 750 entités)

via le portail OpenDataSoft de l'ACPR, en ne récupérant que les colonnes utiles (`?select=denomination,siren,forme_juridique,categorie`) — le fichier complet dépasse 200 Mo à cause de colonnes JSON imbriquées (autorisations détaillées, passeports européens...) inutiles pour Sceau.

Le noyau statique `REGAFI_NOYAU` (Trade Republic, Boursorama, Fortuneo) reste fusionné en complément, pas en repli : certaines marques commerciales connues (ex. Fortuneo) sont enregistrées sous leur nom légal officiel (Arkéa Direct Bank) plutôt que leur nom commercial, donc ne matchent pas toujours dans les données REGAFI même quand elles sont disponibles.

## Limite connue

Le registre REGAFI liste des entités sous leur **nom légal officiel**, qui diffère parfois du nom commercial connu du public :
- Fortuneo → Arkéa Direct Bank *(couvert par le noyau statique)*
- LCL → Crédit lyonnais *(acronyme non résolu automatiquement)*
- HSBC France → HSBC Continental Europe *(renommage non résolu automatiquement)*

Le moteur ne fait pas de résolution acronyme/marque commerciale → nom légal (ce serait une extension de l'algorithme de matching, hors périmètre de cette mise à jour). Ces cas remontent en "inconnu" plutôt qu'en "safe" — pas une fausse alerte, juste une absence de correspondance.

## Si tu veux quand même l'ancienne API par clé (non nécessaire)

Le portail expose aussi une API "REGAFI FR/EN" classique par abonnement (`developer.regafi.banque-france.fr`, inscription libre sur `acpr.opendatasoft.com/signup`) mais elle n'apporte rien de plus que les données ouvertes déjà branchées pour cet usage — inutile de s'y inscrire.
