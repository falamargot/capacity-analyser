# REVISIT — Création d'une cible : le chemin manuel doit être le chemin par défaut

_Proposition, 2026-08-31. **A, B, C et D implémentées le 2026-08-31** ; E et F
restent à faire (voir §7)._

## 1. Ce que fait l'application aujourd'hui

### Polygone (Primary comme Secondary)

1. `+ ADD PRIMARY TARGET` → menu `POINT | POLYGON`.
2. `POLYGON` appelle `handleCreateAreaTarget(role)` : une zone vide est créée
   (0 sommet) et le header ouvre le panneau `AreaPanel` (`setAreaMenuOpen(true)`).
3. `AreaPanel` présente, dans cet ordre : le titre **« Custom area · draw or
   import »**, les champs **Area name** et **Grid spacing °**, puis une rangée de
   trois boutons de poids identique `DRAW ON GLOBE` / `IMPORT GEOJSON` /
   `REMOVE`, puis un `details` replié **« Paste coordinate list »**, puis la
   validation en rouge **« An area needs at least 3 boundary points, got 0 »**.
4. `DRAW ON GLOBE` ferme le panneau et ouvre la barre d'outils de tracé
   au-dessus du globe (compteur de sommets, `Undo`, `Finish polygon`).

Conséquences :

- le chemin le plus rapide (choisir Polygone puis tracer) coûte **trois clics**
  et fait apparaître puis disparaître un panneau qui n'a servi à rien ;
- les deux premiers champs du panneau sont des **paramètres déjà remplis** — le
  nom (`Primary area`) et le pas de grille (déduit de la fauchée par
  `recommendedAreaGridSpacing`) — placés avant l'action ;
- le titre annonce un choix (« draw **or** import ») au moment où l'utilisateur
  n'en a pas besoin ;
- l'application affiche **une erreur sur un état qu'elle vient elle-même de
  créer** : zéro sommet, donc « got 0 ».

### Point secondaire

`handleCreateComparisonPoint` crée une cible **sans coordonnées** : la ligne
affiche `Secondary target · Not set`, un menu `Choose site…`, un éditeur de
coordonnées, et rien d'autre. Le placement au globe se fait par **Shift-clic**,
mentionné uniquement à l'intérieur du popover de coordonnées
(`RevisitHeader.tsx:374`). Le point **primaire** n'a pas ce problème : un clic
simple le déplace. Le même geste ne veut donc pas dire la même chose selon la
cible, et le geste secondaire n'est écrit nulle part où on le cherche.

## 2. Principe proposé

> Le geste manuel est le chemin par défaut ; l'import et le collage sont des
> **sorties de secours accessibles depuis ce chemin**, pas des concurrents
> présentés avant lui.

## 3. Propositions

### A. `POLYGON` entre directement en mode tracé

Le menu appelle `handleCreateAreaTarget(role)` **puis**
`handleStartAreaDrawing()`, et n'ouvre pas `AreaPanel`. La barre d'outils de
tracé — qui existe déjà, compte les sommets et porte `Undo` / `Finish` — devient
l'unique interface. Deux clics au lieu de trois, aucun panneau qui clignote.

### B. La barre de tracé porte les alternatives

Dans cette barre, à droite et en retrait typographique : `Import GeoJSON` ·
`Paste coordinates`. Qui possède déjà un contour client le trouve là et ouvre
`AreaPanel` ; tous les autres tracent. C'est l'inversion demandée, faite en un
seul endroit.

### C. Nom et pas de grille après le contour, pas avant

Les deux champs restent dans `AreaPanel`, atteint par le bouton `…` de la ligne
de cible — c'est-à-dire là où on va quand on veut **modifier** une zone qui
existe. `AreaPanel` cesse d'être la porte d'entrée et redevient ce qu'il est :
l'éditeur.

### D. Pas d'erreur avant le premier geste

Tant que `boundary.length === 0` et que le tracé n'a pas commencé, dire quoi
faire (« Click the globe to place the first corner ») et non ce qui manque
(« needs at least 3 boundary points, got 0 »). La validation démarre au premier
sommet.

### E. Créer un point secondaire arme son placement

Choisir `POINT` place l'application dans un mode **placement à un coup** :
clic simple sur le globe pour poser la cible, `Esc` pour annuler, et un bandeau
jumeau de celui du polygone : « Click the globe to place the Secondary target ».
Le Shift-clic reste le geste expert pour la **déplacer** ensuite. Cela supprime
l'asymétrie avec le point primaire et rend le geste visible au moment précis où
il sert.

### F. Le sélecteur de site reste atteignable pendant ce mode

Pour un site connu (`TARGET_PRESETS`), le menu déroulant est plus rapide que le
globe. Il doit figurer dans le bandeau de placement, pas seulement dans la ligne
de cible.

## 4. Ce qu'il ne faut pas faire

- **Supprimer l'import / le collage.** C'est le seul chemin utilisable avec un
  contour d'AOI fourni par un client ; il change de rang, pas d'existence.
- **Analyser automatiquement dès le troisième sommet.** Chaque cellule est une
  exécution moteur complète : `Finish polygon` reste explicite.

## 5. Ce qui a été implémenté (2026-08-31)

**A.** Le menu `Polygon` appelle `handleCreateAreaTargetAndDraw(role)` : la zone
est créée et le tracé démarre sur le globe, sans ouvrir l'éditeur. `Esc` pendant
une session qui a créé sa propre cible **annule aussi la création** — sinon le
geste « tant pis » laissait un polygone vide derrière lui.

**B.** La barre de tracé porte `Import or paste a boundary instead`. Le clic
quitte le mode tracé (une liste collée remplace le contour de toute façon),
garde le brouillon vide, ouvre l'éditeur et **déplie la zone de collage**. Sur
compact il rouvre aussi le panneau de configuration que le tracé avait fermé.
L'état d'ouverture de l'éditeur est remonté dans `RevisitApp`, la barre vivant
hors du header.

**C.** `AreaPanel` est devenu l'éditeur : `Area boundary` (tracer / importer /
coller) d'abord, `Area settings` (nom, pas de grille) ensuite.

**D.** Sans contour, le panneau dit quoi faire — « Draw the boundary on the
globe, or import a GeoJSON or a coordinate list » — au lieu de
« An area needs at least 3 boundary points, got 0 ». La validation démarre au
premier sommet.

**Deux défauts trouvés en chemin, corrigés :**

- les deux éditeurs de zone (Primary et Secondary) étaient conditionnés au même
  drapeau d'ouverture : un scénario portant les deux polygones les affichait
  **empilés**. Ils sont désormais départagés par `areaTargetRole` ;
- sur téléphone, la barre de tracé partageait sa ligne avec trois boutons : le
  titre passait sur trois lignes et le lien d'import sur quatre. Les boutons
  prennent leur propre ligne sous `sm`.

E et F (mode placement du point secondaire) ne sont pas faits ; le risque n°1
du §6 les concerne toujours.

## 6. Risques à traiter à l'implémentation

1. **E redéfinit la sémantique du clic sur le globe.** En mode POINTS, un clic
   simple déplace aujourd'hui la cible **primaire**. Le mode placement doit être
   exclusif, visible et sortable, sinon il vole un geste existant. C'est le
   point le plus délicat du lot.
2. **Mobile.** Le mode tracé masque déjà les panneaux ; A en fait le chemin par
   défaut, donc le lien d'import de B est le seul accès restant à l'import sur
   téléphone. Il doit être atteignable au pouce (44 px).
3. **Couverture e2e.** `RevisitP1Ui` couvre le panneau ; A, B et E déplacent les
   points d'entrée et demandent une reprise des spécifications qui cliquent
   `DRAW ON GLOBE`.

## 7. Découpage indicatif

| lot | contenu | coût |
|---|---|---|
| A + D | entrée directe en tracé, message au lieu de l'erreur | 2 h |
| B + C | alternatives dans la barre, `AreaPanel` redevient l'éditeur | 3 h |
| E + F | mode placement du point secondaire, bandeau, sélecteur | 1/2 journée |
