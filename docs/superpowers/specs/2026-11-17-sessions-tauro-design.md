# Sessions Tauro dans decoGestion — design (17/11/2026)

## Pourquoi

Les plaques partent à la Tauro H3300 par **sessions** : une session correspond à un rack de 50 plaques. Chaque PDF déposé au RIP Asanti reçoit un nom qui dit tout :

`011_S1711A_151x260_W_MAT_169034_BETON-CLAIR-150x255_4.pdf`

Dans Asanti, une recherche (`S1711A`) retrouve le rack, et un tri par nom donne l'ordre d'impression.

Les règles ont été mises au point et testées hors de decoGestion, dans le dossier « session Tauro Asanti » :
- `REGLES_Nommage_et_Ordre_Tauro.md` et le guide de l'opérateur ;
- `regles-tauro.js` et `lancement-tauro.js`, modules purs prévus pour `runJobs` ;
- `test/lancement.test.js` ;
- le design du mode hors session.

Il faut maintenant les brancher dans decoGestion.

## Ce que voit l'opérateur

- **Deux boutons dans la file** : « Lancer en session » (le mode par défaut) et « Lancer hors session ». Ils agissent sur la sélection, ou sur toute la file si rien n'est sélectionné. C'est toujours l'opérateur qui choisit : rien n'est déduit automatiquement.
- **Un aperçu, puis une confirmation.** La fenêtre affiche :
  - les sessions : code, finition, ex., nombre de jobs, n° de début et de fin ;
  - les jobs qui restent dans la file (non lancés) ;
  - l'autre finition, ignorée ;
  - les jobs bloqués, avec leur raison et une case « Relancer » ;
  - les informations.

  Une bascule Mat / Brillant est réglée sur Mat par défaut. L'opérateur clique sur Annuler ou sur « Lancer N session(s) ».
- **Hors session** : la même fenêtre, en plus simple (PDF sous leur nom d'origine, bloqués).
- **Ce qui ne part pas reste dans la file** de decoGestion.

## Règles (reprises du dossier session Tauro)

- **Sessions** :
  - Mat : exactement 50 ex. ;
  - Brillant : au moins 20 ex., au plus près de 50, jamais plus de 60 ;
  - un lancement = une finition ;
  - les commandes restent entières ;
  - l'ordre de la sélection de l'opérateur est conservé.
- **Ordre de production et nom** : `regles-tauro.js`, sans modification.
- **Lettre et n° d'ordre** continus sur la journée, repris du journal.
- **Contrôles** :
  - une ligne déjà lancée est bloquée (avec le détail si elle a été modifiée), sauf si l'opérateur la relance ;
  - une même clé présente deux fois est bloquée ;
  - un nombre d'ex. invalide est bloqué ;
  - « commande déjà en partie lancée » est signalé à titre d'information.
- **Hors session** :
  - nom d'origine, sans minimum, Mat et Brillant ensemble ;
  - ne consomme ni lettre ni n° ;
  - inscrit au journal ;
  - une réimpression = hors session + relancer.

## Décisions propres à decoGestion

- **Le nouveau nom ne s'applique qu'au PDF déposé.** `fileName` ne change pas : le texte imprimé sur la plaque, les étiquettes, le vernis et le `.cut` restent les mêmes. Le hot folder reste `job.writePath`. Le `hf` du module sert seulement de contrôle, comparé à `path.basename(job.writePath)`.
- **JPG triés dans l'ordre d'impression.**
  - En session, le fichier JPG de `PRINTSA#<date>/` prend le préfixe `<session>-<n°> `, par exemple `S1711A-011 169034 - LM AMIENS - 151x260 - BETON CLAIR 150x255 4_EX.jpg`.
  - Le titre imprimé sur la page JPG reste le `fileName` : `composeJpgPage` reçoit un titre explicite.
  - Hors session et sans PDF : nom inchangé.
- **Étiquettes** : un seul PDF, trié par n° d'ordre Tauro. Le hors session et les jobs sans PDF suivent, dans l'ordre de la file.
- **Teinte masse et stock** (aucun PDF) : ils ne comptent pas dans les 50 et n'ont pas de n°. Ils partent dans le même lancement (JPG, étiquettes, Deco).
- **Crédences** :
  - un job = une plaque × `ex` ;
  - décor du nom : `DECO1-ET-DECO2`, car `regles.visuel()` supprimerait le `+` ;
  - finition tirée du 1er visuel ;
  - si `cmd2` est non nul et différent de `cmd`, la commande du nom devient `169034+169380`, et une entrée de journal est inscrite par panneau (`cmd/sousDossier`, `cmd2/sousDossier2`) : les deux commandes sont contrôlées.
- **Sur-mesure** :
  - décor = partie de `smBase` après le dernier ` - ` ;
  - `fmtVis` = `smFormat`, finition lue dans `smBase` ;
  - clé `cmd/sousDossier-p<smPage>`.
- **Commande 0 ou job sans sous-dossier** : clé `id:<_id>`, sans alerte « commande en partie lancée ».
- **Jobs fusionnés** (`addJob`, ex additionnés) : on conserve `sousDossiers[]` et on inscrit une entrée de journal par sous-dossier.
- **Finition** : lue dans le nom du visuel (`finitionDe`, comme `checkVernis` et les étiquettes). L'aperçu affiche une alerte si `refDbData.finition` dit autre chose.
- **Journal** : collection Mongo `LancementTauro`.
  - Champs : `date, jour (AAAA-MM-JJ, heure locale), job, hf, source, octets, cle, cmd, ex, signature, mode, nomSansSession`.
  - Index sur `jour`, `cle`, `cmd` et `nomSansSession`.
  - Requêtes ciblées : clés, commandes et noms de la sélection, plus les entrées du jour.
  - Il part vide : on n'importe pas `journal_envois.csv`, qui ne contenait que des essais.
- **Aucun écrasement, aucun double dépôt** (lancements Tauro seulement ; sans Tauro, rien ne change) :
  - au début de `processJob`, si la clé et le nom sont déjà au journal, le PDF a déjà été déposé : succès, sans nouvelle copie ;
  - le dépôt se fait avec `COPYFILE_EXCL`. « Déjà présent » lève une `UnrecoverableError`, donc sans nouvelle tentative BullMQ ;
  - si le journal échoue après un dépôt réussi, un `jobWarning` est émis et le job n'échoue pas.
- **Plan figé** :
  - `POST /tauro/plan` calcule le plan en simulation et renvoie une empreinte : ids (session, hors session, sans PDF), noms, ex, finition, relancer ;
  - `run_jobs` recalcule le plan et répond **409** si l'empreinte diffère ;
  - le verrou « traitement en cours » est pris avant tout `await`.
- **Les noms Tauro vont sur des copies des jobs** passées à `enqueueRun` : un job en échec reste dans la file sans nom. Son n° reste vide dans la session.
- **Pas d'`applyPriorities`** pendant un lancement Tauro.

## Approches considérées

- **A. Module copié, plan calculé au lancement** *(retenue)*. On réutilise les règles déjà validées par les tests et le rejeu des logs réels, et ce qui part est ce que l'opérateur a vu. Coût : deux copies du module à garder alignées.
- **B. Réécriture native.** Une seule version du code, mais tout serait à revalider.
- **C. Noms calculés à l'ajout d'un job.** Impossible : le n° dépend de toute la session.

## Non-objectifs

- Pas de nouvelle vérification Gamesys (annulation, quantité) au lancement.
- Pas de réglage des hot folders Asanti (lecture du `_4`).
- Pas de file Tauro séparée.

## Laissé au développeur

- Découpage des fichiers serveur et client, forme exacte du plan sérialisé.
- Libellés de l'interface, dans le ton de JobsList.
