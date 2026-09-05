# REVISIT — Loupe temporelle sur la timeline : plan d'exécution

_Proposition, 2026-09-04. **P0 à P4 implémentés le 2026-09-05, parité mobile comprise.** Contrainte
imposée : aucune perte de performance, démontrée par mesure et non par
raisonnement._

## 0. État au 2026-09-05 — terminé

Fichiers : `ui/passSpans.ts` (projection commune + `drawnPassNear`),
`ui/lensReadings.ts` (portée, formats, phrase de lecture),
`ui/coverageRibbonSnap.ts` (tolérance de clic partagée),
`ui/CoverageLens.tsx` (composant mémoïsé, poignée impérative, pool de 64 rects,
portail), et le câblage pointeur + rAF + clic dans `ui/CoverageRibbon.tsx`.
**790 tests** REVISIT (2348 sur tout le projet), `tsc` et `eslint` propres.

### Ce que le navigateur a imposé, et que le plan n'avait pas prévu

1. **Placement.** La carte timeline a `overflow: hidden` et la scène qui la
   contient peint **sous** le conteneur plein écran du canvas Cesium : un
   panneau correctement positionné, dimensionné et non masqué n'apparaissait
   pas. `position: fixed` règle le premier problème, pas le second — seul un
   **portail** vers `document.body` règle les deux. La loupe se place au-dessus
   du **bord de la carte** nommé par l'hôte (`CoverageLensAnchor.anchorTop`),
   pas au-dessus de la piste : la rangée juste au-dessus de la piste porte les
   contrôles de transport, et un panneau ancré à la piste recouvrait PAUSE.

2. **Défaut préexistant trouvé en vérifiant.** La surface de seek était **3 px
   plus large et décalée de 3 px à gauche** que la piste réellement dessinée :
   les lignes portent un rail `border-l-[3px]` que la grille de superposition ne
   reproduisait pas. Le playhead et chaque clic étaient donc mappés dans une
   boîte où les ticks **ne sont pas** dessinés — **~14 min de dérive au début**
   d'une fenêtre de 72 h, décroissant à zéro à sa fin. Corrigé ; les deux boîtes
   coïncident exactement (`deltaLeft = 0`, `deltaWidth = 0`).

3. **Le snap ne pouvait pas exiger de viser le tick.** Première règle écrite :
   snapper si le clic tombe **dans** le tick dessiné. Mesuré : sur 72 h à
   939 px, le plancher de 5,2 min fait **1,1 px**. Une règle qui exige de viser
   1,1 px ne se déclenche jamais — c'est le défaut d'origine, un étage plus bas.
   La règle retenue est un **rayon de clic** de 3 px (`SNAP_TOLERANCE_PX`),
   converti en temps depuis la largeur réelle de la piste : 9 min sur 72 h,
   3 min sur 24 h. La tolérance suit ce que le lecteur voit, pas l'horloge.

### Écart assumé par rapport au plan (P3)

Le plan prévoyait de réutiliser `CoverageLens` **ancrée au playhead** pour la
parité tactile/clavier. Après avoir vu le panneau flottant au-dessus du globe,
c'est refusé : un panneau ouvert en permanence sur une surface de présentation
coûte plus qu'il n'apporte. La parité est livrée autrement — la **même phrase**
(`describePassAt`) écrite en texte dans l'en-tête de la timeline
(`data-revisit-playhead-reading`), en impératif, à la cadence aria de 2 Hz. Pas
de panneau, pas de problème de placement, lisible au doigt, au clavier et au
lecteur d'écran. Décision réversible si un panneau épinglé est voulu.

Le seuil de 0,1 h (6 min) qui filtre `currentHours` est plus grossier que la
plupart des passages : c'est pourquoi cette lecture est écrite en impératif et
ne peut pas rouler sur cet état. Un test le vérifie explicitement.

### Mesures

| mesure | résultat | garde |
|---|---|---|
| `update()` — 240 h, 5760 passages, seul | **0,127 ms moyenne · 0,145 ms p95** | < 2 ms / < 4 ms |
| `update()` — même code, suite complète en parallèle | 0,40 ms moyenne | idem |
| passage 24 h → 240 h (×10 de passages) | **ratio 1,14** | < 3 |
| nœuds DOM après 1000 `update()` | **inchangés** | égalité stricte |
| commits React sur un balayage de 500 mouvements / 10 frames | **0** | égalité stricte |
| Cesium sur le chemin ruban | **aucun import, aucun `requestRender`** | assertion de source |

Les gardes absolues sont volontairement très au-dessus des valeurs mesurées :
le même code mesure 0,13 ms seul et 0,40 ms sous la charge de la suite
parallèle, et une garde posée près de la bonne valeur est une garde qui casse
sur une machine occupée puis qui se fait supprimer. C'est **le ratio d'échelle**
qui teste réellement la conception, et il est indépendant de la machine.

**Ce que P4 n'établit pas**, et le dire est le point : le taux de trame
*présenté*. Il faudrait un navigateur qui présente des trames, or le pane
d'automatisation rapporte `visibilityState === "hidden"` et n'émet aucune rAF —
l'obstacle exact documenté par R29c. L'assertion structurelle est de toute façon
plus forte : le coût du globe **ne peut pas** changer, puisque rien sur ce
chemin ne l'atteint.

### La loupe suit la ligne SURVOLÉE — 2026-09-05

Première version : la loupe lisait la ligne **sélectionnée**. En mode
comparaison, survoler la ligne Secondary et se voir présenter les passages de la
Primary est illisible — le panneau répond à une question que le lecteur n'a pas
posée. Elle suit désormais la ligne **sous le pointeur**.

**Sans état React.** La ligne survolée ne peut pas être un état : traverser une
ligne re-rendrait le ruban au rythme du pointeur. La loupe reçoit donc **toutes**
les lignes dans une prop stable (`CoverageLensLane[]`) et `update()` en nomme une
par indice — un troisième scalaire, toujours sans allocation. Un `PassSpanIndex`
par ligne, mémoïsé sur le tableau ; le pool reste d'une ligne, une seule étant
affichée à la fois. Les couleurs (64 rects + densité + libellé) sont repeintes
**uniquement au changement de ligne**, pas à chaque frame. Un test l'assure :
traverser les lignes 20 fois coûte zéro commit React.

**Résolution de la ligne.** La surface de seek couvre toutes les lignes à la
fois, donc seul `clientY` dit laquelle. Les bandes verticales sont mesurées avec
la boîte de piste — à `pointerenter` et au `ResizeObserver`, jamais dans la
boucle. La ligne retenue est la **plus proche**, jamais « aucune » : les 8 px de
gouttière entre deux lignes appartiennent au même geste, et une zone morte y
ferait clignoter le panneau en plein glissement.

**Le clic snappe sur la ligne survolée**, pas sur la sélectionnée : la phrase qui
offre le snap et le clic qui l'exécute doivent nommer le même passage.

**Deux incohérences ergonomiques corrigées dans la foulée**, toutes deux vues à
l'écran :

1. La lecture playhead de l'en-tête suit la **sélection** (elle n'a pas de
   pointeur derrière elle) pendant que la loupe suit le **pointeur** : avec deux
   lignes, les deux peuvent légitimement parler de cibles différentes. Une phrase
   non attribuée à côté d'« Observation schedule comparison » se lit comme
   portant sur la ligne que l'œil vient de quitter. Elle est donc préfixée du nom
   de sa ligne dès qu'il y a plus d'une ligne.
2. Dans l'en-tête de la loupe, le nom de la ligne et la plage se disputaient
   300 px et la plage gagnait toujours : « Singapore » s'affichait « SIN… ».
   Nommer la ligne étant la raison d'être de cet en-tête, l'identité a désormais
   sa propre ligne, dans la couleur de la ligne — la même que ses ticks.

Vérifié au navigateur avec deux cibles : survol de la ligne Primary →
« 38.93°N 10.00°E » en ambre ; survol de la Secondary → « Singapore » en bleu ;
en-tête inchangé sur « Singapore · No pass · next in 2 h 00 min » (la sélection).
Coût mesuré après le changement : **0,126 ms moyenne**, ratio d'échelle **1,09**.

### La destination du clic — 2026-09-05

Troisième repère demandé : montrer, avant de cliquer, **où le clic va**.

Premier essai écarté : un chevron sous la piste, à la position du passage visé.
Il fonctionnait, mais c'était une glyphe de plus sur une piste de 22 px qui porte
déjà les ticks, le trait plein (pointeur) et le tireté (globe) — une quatrième
marque à distinguer des trois autres, dans la couleur des ticks.

Retenu à la place : **la destination n'est pas une marque, c'est un contour sur
le tick visé**. Aucun élément nouveau, aucune ambiguïté possible — le contour est
attaché au passage lui-même — et il disparaît entièrement quand aucun snap n'est
offert. La règle vient de `snapTargetAt`, la **même fonction** que la phrase qui
offre le clic : les mots et la marque ne peuvent pas désigner deux passages
différents. Jamais sur la ligne non emphasée (elle n'est pas cliquable), jamais
quand le pointeur est déjà dans un passage (il n'y a rien où aller).

Coût : deux écritures d'attribut au plus par frame — l'index du tick contourné
est mémorisé par ligne, donc changer de destination efface l'ancien et pose le
nouveau, sans repasser sur le pool.

**Limite assumée :** quand le passage visé est à quelques secondes du pointeur,
le contour se superpose presque au trait central et n'apprend rien — il ne coûte
rien non plus. Et sur un passage très court, ramené à 1 px dans la loupe, le
contour de 1,5 px pèse plus que le tick qu'il entoure. Les deux cas sont
acceptables ; le cas qui a motivé la demande — un passage à 8 minutes en arrière
— est celui où il est le plus net : le tick contouré est à 50 px du centre.

Vérifié au navigateur sur ce cas exact : « Nearest pass ended 8 min 34 s ago ·
click to seek to it », un seul tick contouré, à gauche du centre.

### Deux instants, deux marqueurs — 2026-09-05

Question posée sur capture : la loupe annonçait « In view · 1 min 52 s » sur la
ligne Secondary, et aucun satellite n'était sur cette cible dans le globe.

Ce n'était pas un défaut de calcul, mais un **non-dit** : la loupe décrit
l'instant sous le **pointeur**, le globe montre l'instant du **playhead**, et
rien ne signalait que ce sont deux instants différents. S'y ajoutait le snap :
le clic ne va pas à l'instant survolé, il va au passage le plus proche de la
ligne **mise en avant** — ici 8 min plus tôt, où la Secondary n'est plus en vue.

La loupe dessine donc maintenant un **second marqueur, tireté**, à la position du
playhead quand celui-ci tombe dans l'heure visible, sur chaque piste. Deux
repères, deux significations : le trait plein continu est le pointeur — ce que
toutes les phrases du panneau décrivent — le tireté est le globe. Quand ils
coïncident, la lecture décrit ce qui est à l'écran ; quand ils s'écartent, la
distance entre eux **est** la réponse à « pourquoi aucun satellite sur cette
cible ». Hors de l'heure visible, le marqueur est masqué plutôt que collé à un
bord, ce qui inventerait une proximité.

Le coût est nul en régime : la position est calculée dans `draw`, déjà appelée
au mouvement du pointeur et rafraîchie à 2 Hz pendant le survol.

### La loupe montre TOUTES les lignes — 2026-09-05

Décision inversée : la loupe ne lit plus une ligne, elle les empile **toutes**
sur le même axe. Ce qui la rendait défendable, c'est `MAX_SECONDARY_TARGETS = 1` :
la timeline a au plus **deux** lignes, donc il n'y a pas de N à borner.

Et c'est la bonne réponse au problème que le mode comparaison pose : à l'échelle
du ruban, savoir si les deux cibles sont vues **en même temps** ou **en
alternance** est illisible — un tick fait 1,1 px. Empilées sur la même plage, la
même ligne centrale et les mêmes 12 s/px, la réponse est immédiate.

Le survol ne disparaît pas, il change de rôle : il ne choisit plus *ce qu'on
lit* — on lit tout — mais *ce qui est mis en avant*. La ligne sous le pointeur
est à pleine opacité, porte la phrase complète et l'offre de clic, et **c'est
elle que le clic snappe** ; l'autre est atténuée à 0,55 avec une phrase courte
(`summarisePassAt` : « In view · 1 min 30 s », « Next in 14 min 41 s ») qui suffit
à comparer sans prétendre être le sujet. `data-revisit-lens-emphasis` l'énonce
plutôt que de le laisser à l'opacité seule.

Deux effets de bord bienvenus : l'identité descend sur chaque piste, donc
l'en-tête ne garde que ce que les lignes **partagent** (plage, empan, échelle) et
la troncature « SIN… » disparaît structurellement ; et une timeline à une seule
ligne affiche un panneau à une seule ligne, exactement comme avant.

Coût tenu : pool de `MAX_LENS_TICKS × MAX_LENS_LANES` alloué une fois, et la
boucle de masquage ne parcourt plus que `max(dessinés avant, dessinés maintenant)`
au lieu des 64 — une correction qui valait déjà pour une seule piste et qui
compense le doublement du dessin. Mesuré après : 0,26 ms moyenne, ratio d'échelle
0,98, chemin de lecture toujours ×30 par rapport au linéaire. Vérifié au
navigateur en comparaison : panneau de 137 px, « 38.93°N 10.00°E » en ambre et
« Singapore » en bleu, l'emphase suivant le pointeur d'une ligne à l'autre.

### Seconde revue, sur tout l'arbre non commité — 2026-09-05, cinq constats corrigés

Deux hors REVISIT, dans le travail présent dans l'arbre :

1. **`z-[calc(var(--z-ui-dialog)+1)]` était du CSS invalide.** Dans `calc()`, `+`
   et `-` exigent des espaces. Mesuré dans le navigateur : cette valeur calcule
   `z-index: auto`, la forme espacée donne `2201`, et
   `CSS.supports('z-index','calc(2200+1)')` est `false`. Le backdrop de
   l'inspecteur mobile n'avait donc plus **aucun** ordre d'empilement, là où il
   avait `z-[1400]`. Corrigé en `z-[calc(var(--z-ui-dialog)_+_1)]`.
2. **Un échec de trafic aérien était mis en cache pendant une minute.** Retirer
   les avions fictifs est juste ; écrire le `[]` de l'échec dans le cache avec un
   horodatage frais éteignait la couche pour `CACHE_DURATION` entière sur un
   hoquet d'une seconde. Les dernières positions valides sont désormais servies,
   et le sondage suivant re-tente immédiatement. Test ajouté.
3. **Le bandeau réglementaire clignotait sur le chemin nominal.** Le correctif
   jumeau met l'état à `null` au début de chaque lookup, donc « absent » est
   l'état normal des premières centaines de millisecondes de chaque sélection.
   Le bandeau n'apparaît plus qu'après 2 s sans réponse, et dit « unavailable »
   plutôt que « pending or unavailable ».

Trois dans REVISIT :

4. **Ticks fantômes** — masquer une ligne remettait son compteur de ticks à zéro,
   donc la boucle `max(avant, maintenant)` ne nettoyait plus les restes : après
   suppression puis remplacement d'une secondaire, des passages de la cible
   disparue réapparaissaient. Le compteur décrit ce que le DOM contient, pas ce
   qui est visible : il n'est plus remis à zéro. Régression introduite par
   l'empilement, test ajouté.
5. **`pushLens` alloué par frame** — hissé hors du callback rAF.
6. Et le test « ne mesure jamais par frame » a été réécrit : le contrat est une
   **cadence** (2 Hz pendant le survol), pas un silence, et son budget se dérive
   du temps écoulé réel — sinon il échoue sur une machine lente pour avoir eu
   raison.

### Revue de code du lot — 2026-09-05, six constats, tous corrigés

**1. Une ligne sans résultat était décrite comme une ligne sans passage.**
`lensLanes` jetait le `statusLabel`, donc une ligne encore en calcul arrivait à
la loupe comme une liste vide et le panneau affirmait « No pass in view » — une
conclusion sur une analyse qui n'a pas tourné, pendant que sa propre cellule
affiche « Computing… ». La loupe **et** la lecture d'en-tête portent maintenant
l'état, et suivent la **même règle** que la cellule de résultat (`statusLabel`,
ou ligne secondaire sans statistiques pendant un calcul de comparaison), écrite
en une seule expression pour qu'elles ne puissent pas diverger.

**2. La géométrie en cache pouvait vieillir sous un pointeur immobile.** Un
`ResizeObserver` ne se déclenche jamais sur un simple déplacement : un reflow
au-dessus de la piste déplaçait les lignes et la loupe continuait de lire la
précédente. Trois corrections : rafraîchissement à la cadence aria (2 Hz)
**uniquement pendant le survol**, avec re-poussée de la lecture pour que la
ligne lue et la position du panneau se corrigent seules en moins d'une
demi-seconde ; mesure à `pointerdown`, pour qu'un clic soit résolu contre la
géométrie qu'il visait ; et le clic lit désormais **la même boîte en cache** que
la loupe, au lieu d'un rect frais — c'était la façon dont la phrase et l'action
pouvaient nommer deux passages différents. Le verrou tactile tient pendant le
rafraîchissement : un doigt garde sa ligne, une souris suit ce qui passe dessous.

**3 et 4. Le chemin de lecture est passé par l'index.** `drawnPassNear` prenait
`bestIndex ± 1` comme voisin, donc supposait la liste triée — ce que
`buildPassSpanIndex` refuse explicitement de supposer — et `describePassAt`
parcourait toute la ligne à chaque mouvement de pointeur, alors que le dessin à
côté passait par la recherche binaire. Les deux sont unifiés derrière
`passNeighbourhood`, indexé quand l'index existe et **sans hypothèse d'ordre**
sinon.

Mesuré dans le même process, sur 5760 intervalles :

| chemin | linéaire | indexé | gain |
|---|---|---|---|
| `describePassAt` | 39,6 µs | **1,3 µs** | ×30 |
| `drawnPassNear` | 26,4 µs | **0,21 µs** | ×177 |

C'est cette mesure **relative** qui est devenue la garde (`INDEXED_SPEEDUP_MIN`),
pas une milliseconde absolue : le même code mesure 0,13 ms sur une machine au
repos et 0,24 ms à une charge de 9,5 — un ratio annule cela, une valeur absolue
non. Corollaire noté au passage : `passNeighbourhood` écrit dans un **scratch**
fourni par l'appelant, chacun le sien, selon la même discipline que `EciState`
dans le propagateur — un objet neuf par appel coûtait à lui seul 0,10 ms.

**5. La plage de la loupe ne datait que son début** : un empan à cheval sur
minuit affichait « 09-05 23:45:00 → 00:45:00 » et attribuait les deux instants
au même jour — l'ambiguïté même que `formatUtcDay` venait supprimer. Les deux
bornes sont datées quand elles diffèrent, et la comparaison de jour est
arithmétique et non formatée, pour ne pas ajouter un `toISOString` par frame.

**6. La fixture de perf était 24× plus dense que son commentaire** (24 passages
par heure, pas par jour). La densité est conservée — une garde vaut mieux
au-delà du pire cas qu'à hauteur — et le commentaire dit maintenant la vérité.

Après correction : **780 tests**, `tsc` et `eslint` propres, ratio d'échelle
0,99, et vérification navigateur en comparaison (loupe « CAPE TOWN » en bleu
avec sa date, en-tête « Cape Town · … » sur la sélection).

### Cohérence du survol sur mobile — 2026-09-05

Géométrie **mesurée en direct** à 375 × 812, deux cibles ouvertes :

| grandeur | valeur |
|---|---|
| colonne de piste | **114 px** pour 72 h |
| résolution | **38 min / px** |
| ligne de cible | 28 px de haut, **6 px** de gouttière |
| rayon de snap à 3 px | **114 min** |
| `touch-action` de la surface de seek | `pan-y` ✓ |
| lecture playhead | 341 px, sur sa propre ligne ✓ |

Deux incohérences en découlent, corrigées.

**1. Un doigt ne change pas d'avis verticalement.** Sur une souris, passer sur
une autre ligne veut dire « lis celle-là ». Un doigt qui glisse le long d'une
ligne de 28 px dévie de plusieurs pixels sans rien vouloir dire — et les lignes
sont à 6 px l'une de l'autre. En re-résolvant à chaque `pointermove`, un
balayage horizontal aurait changé de sujet en cours de route : le panneau aurait
continué de fonctionner en décrivant une autre cible. Le tactile **verrouille
donc la ligne sur laquelle il s'est posé** pour toute la durée du geste ; lever
le doigt et se reposer ailleurs est la façon dont un doigt change de ligne. La
souris, elle, continue de suivre le pointeur.

**2. Le rayon de snap devenait absurde.** 3 px valent 9 min sur une piste de
939 px et **114 min** sur 114 px — plus long que les intervalles entre passages.
`drawnPassNear` plafonne désormais la tolérance à la **moitié de l'écart du côté
où se trouve le pointeur** : un clic n'est jamais tiré au-delà du milieu entre
deux passages.

Ce que ce plafond **ne fait pas**, et la distinction est écrite dans le code :
sur une piste aussi grossière il ne laisse pas une partie de l'écart non
snappée — les deux moitiés le couvrent. C'est le bon comportement là, pas un
compromis : à 38 min/px un écart fait un pixel de large, « le milieu de l'écart »
n'est pas visable, et snapper au passage le plus proche est le seul sens qu'un
tap puisse porter. Sur une piste desktop le rayon en pixels reste très en
dessous de la moitié d'un écart, donc le milieu d'un écart y reste un seek
simple — c'est testé des deux côtés.

**Ce qui n'a pas pu être vérifié en direct :** le comportement animé sur mobile.
Le pane n'a présenté aucune trame (`visibilityState === "hidden"`, zéro rAF), or
la loupe **et** l'affichage de l'horloge passent par la boucle de trames — même
le résultat d'un clic n'est donc pas observable. La géométrie ci-dessus est
mesurée en direct ; le comportement est couvert au niveau composant à 375 px
réels, avec exactement ces nombres (`CoverageLensMobile.test.tsx`, 12 tests).

### Parité mobile — 2026-09-05

Le ruban est rendu tel quel sur téléphone (aucun garde `md:`), donc trois choses
cassaient à 375 px, chacune corrigée et couverte par un test :

1. **Pas de survol, mais un glissement.** Un doigt émet
   `pointerenter → move → leave` comme une souris : glisser le long de la piste
   scrube la loupe, lever le doigt seeke (avec snap). Deux ajouts pour que ce
   soit vrai — `touch-pan-y` sur la surface de seek, pour que le geste
   horizontal appartienne au curseur pendant que le défilement vertical reste à
   la page ; et `pointercancel`, que la souris n'émet jamais et sans lequel le
   panneau resterait ouvert quand le navigateur reprend le geste.
2. **La piste est plus étroite que le panneau.** ~120 px de colonne contre
   300 px de loupe : « à l'intérieur de la piste » n'a alors pas de solution, et
   un clamp naïf posait le bord gauche hors écran. Ordre retenu : clamp sur la
   piste **puis** sur la fenêtre ; quand la piste ne peut pas contenir le
   panneau, il se fixe au centre de la piste et cesse de suivre le doigt plutôt
   que de sortir de l'écran.
3. **La lecture playhead** est pleine largeur sur téléphone ; le minimum de
   17 rem ne s'applique qu'à partir de `md`, où la barre d'outils est assez
   large pour la tenir en ligne.

`MobileResultStrip` n'est volontairement pas touché : c'est la bande d'**analyse**
repliée (verdict + pire écart), pas la timeline. La timeline est présente sur
téléphone, et c'est sa lecture playhead qui porte la parité.

**Défaut trouvé par ces tests, et corrigé.** L'en-tête de la loupe n'affichait
qu'une horloge murale : sur une fenêtre de 72 h, deux instants distants de 48 h
produisaient une étiquette **identique caractère pour caractère**. Le test l'a
révélé en déplaçant le pointeur de 48 h et en relisant la même chaîne — c'est
exactement ainsi qu'un lecteur serait trompé. La date est désormais préfixée dès
que la fenêtre dépasse 24 h (`formatUtcDay`), et omise en dessous où elle serait
du bruit.

**Ce qui n'a pas pu être fait :** la vérification en direct sur un vrai viewport
mobile. Le pane du navigateur a cessé de présenter des trames et d'accepter les
entrées (`visibilityState === "hidden"`, zéro rAF — l'obstacle documenté par
R29c), or la loupe est pilotée par une boucle de trames. La preuve mobile est
donc au niveau composant, à 375 px réels et avec la géométrie de piste réelle
(`CoverageLensMobile.test.tsx`, 8 tests) ; la preuve en direct reste celle du
desktop, ci-dessous.

### Vérification navigateur du 2026-09-05

Sur un passage réel, la loupe le dessine à **7,97 px = 95,6 s** là où le ruban
le dessine à son plancher de 5,18 min : facteur **3,25**, conforme au ~3,5
annoncé avant d'écrire une ligne de code. Et le scénario complet : survol d'un
tick → « In view · 1 min 24 s · AOS 00:35:43 → LOS 00:37:07 », clic → horloge à
**00:36:25** (milieu du passage), lecture en pause, et **le satellite avec son
swath est sur la cible** sur le globe. C'est exactement ce qui manquait dans la
capture d'origine.

---

## 1. Le défaut constaté

Sur une fenêtre de 72 h, le curseur de la timeline paraît posé sur un passage
alors qu'aucun swath n'est sur la cible dans le globe.

Ce n'est **pas** une incohérence géométrique. Vérifié dans le code :

- même époque des deux côtés (`scenario.window.startMs`) ;
- même horloge (`getTimeMs`, `SimulationClock`) ;
- même sous-constellation (`selectedSatelliteIds`, via `selectSubConstellation`
  côté analyse et `selectedIds` côté scène) ;
- même instrument (`prepareFov(scenario.payload)`) ;
- empreinte dessinée = intersection rayon/ellipsoïde WGS84 exacte (R28), donc
  sur la même surface que le test d'accès.

Le défaut est une **résolution temporelle de rendu**, et l'arithmétique le
démontre à partir des chiffres que le panneau affiche lui-même :

| grandeur | valeur | source |
|---|---|---|
| passages / jour | 24 | panneau |
| part du temps en vue | 2,5 % | panneau |
| **durée réelle d'un passage** | **≈ 90 s** | 0,025 × 1440 min ÷ 24 |
| **largeur plancher d'un tick** | **5,2 min** | 0,12 % × 72 h — `CoverageRibbon.tsx:325` |
| 1 px de piste (72 h sur ~1500 px) | ≈ 2,9 min | mesure d'écran |
| déplacement sol en 3 min | ≈ 1 200 km | v_sol ≈ 6,5 km/s |
| demi-fauchée | 350 km | fauchée 700 km |

Un passage vaut donc ~0,5 px : il est dessiné à son plancher de lisibilité,
**3 à 4 fois plus large que la réalité**. « Le curseur est sur un trait » n'est
vrai qu'à ±3 à 5 min près, pendant lesquelles le satellite parcourt 1 000 à
2 000 km — très au-delà des 350 km de demi-fauchée. Le plancher est un mensonge
assumé sur la durée ; c'est ce mensonge qui est lu.

Deux aggravants : `unionAccessIntervals` fusionne aussi les intervalles
strictement adjacents (un trait peut être plusieurs passages), et le clic de
seek a la même granularité — viser un trait dépose typiquement **à côté** du
passage.

## 2. La réponse retenue

Une **loupe temporelle** au survol de la piste, qui re-rend les intervalles sur
une sous-plage à échelle honnête, et depuis laquelle on peut seeker.

Deux décisions closes, à ne pas rediscuter :

**(a) On magnifie la donnée, pas les pixels.** Un `transform: scale(10)` sur le
SVG existant agrandirait les rectangles *déjà plafonnés* : le même mensonge, dix
fois plus gros. La loupe re-calcule x et largeur contre `[t0, t1]`, plancher
supprimé.

**(b) La loupe est définie par un EMPAN TEMPOREL, pas par un facteur.** La
fenêtre d'analyse va de 24 h à `MAX_WINDOW_HOURS` = 240 h : « ×10 » ne désigne
pas la même chose d'un scénario à l'autre. Défaut retenu : **±30 min** autour du
pointeur (empan 1 h), ce qui donne mécaniquement ×3 à ×30 selon la fenêtre et
reste prévisible pour un spectateur.

Résolution obtenue à 72 h, loupe de 300 px pour 1 h : **12 s/px** — un passage
médian fait 7 px, un passage rasant de 20 s en fait 2. Le plancher intra-loupe
tombe à 1 px et ne déforme plus rien de lisible.

## 3. Budget de performance et mécanismes qui le tiennent

La contrainte n'est pas « rester fluide », c'est **ne rien coûter quand la
souris n'est pas sur la piste, et coûter une quantité bornée quand elle y est**.
Sept mécanismes, tous déjà employés ailleurs dans le module :

1. **Zéro état React au mouvement du pointeur.** `CoverageRibbon` évite déjà
   délibérément de se re-rendre sur l'horloge : le playhead est écrit en
   impératif (`playheadRef.current.style.left`) dans une rAF, et la mise à jour
   ARIA est étranglée à 2 Hz avec un seuil de 0,1 h. La loupe suit le même
   patron : `pointermove` écrit un `clientX` dans une ref, rien d'autre.
2. **Une seule boucle rAF, celle qui existe.** Pas de seconde boucle : le tick
   actuel lit la ref et met la loupe à jour **si et seulement si** le pointeur a
   bougé d'au moins 1 px. Coalescence gratuite : plusieurs `pointermove` par
   frame ne produisent qu'une mise à jour.
3. **Poignée impérative, pas de props qui changent.** `CoverageLens` est monté
   une fois, mémoïsé, et expose `update(hoverMs)` via `useImperativeHandle`. Le
   parent l'appelle depuis la rAF : **aucun rendu React par frame**, ni du ruban
   ni des lignes. C'est la raison d'être du `React.memo` déjà posé sur
   `InViewBand` (360 rects par ligne de zone), étendue.
4. **Pool de nœuds pré-alloués, jamais recréés.** Séparation structure /
   géométrie identique à `orbitPositionCache` et `swathPositionCache` dans
   `useRevisitScene` : N rects alloués une fois, puis seuls `x`, `width`,
   `hidden` sont écrits. Aucun `removeAll` par frame, aucune allocation en
   régime établi.
5. **Travail borné et indépendant de la fenêtre.** Les intervalles sont déjà
   triés par `unionAccessIntervals` : recherche binaire sur un `Float64Array`
   des débuts (mémoïsé sur l'identité du tableau) → O(log n + k). k est borné
   par la physique (~2 à 4 passages/h) et **plafonné en dur** à 64 rects ; au-delà
   la loupe bascule sur un remplissage de densité et le dit.
6. **Aucune lecture de layout dans la rAF.** `getBoundingClientRect()` de la
   surface de seek est lu une fois à `pointerenter` et sur `ResizeObserver`,
   puis mis en cache. C'est le coût caché classique d'une loupe au survol et le
   seul mécanisme de cette liste dont l'omission coûterait réellement des
   frames.
7. **Composition GPU, et rien de permanent.** La loupe est positionnée par
   `transform: translate3d(x,0,0)` (composité) et non par `left` ;
   `will-change: transform` et `contain: layout paint` sont posés à l'entrée du
   pointeur et **retirés à la sortie**, pour ne pas laisser une couche de
   compositing vivante en permanence sur une surface de présentation.

Conséquence structurelle à énoncer : **la loupe ne touche jamais Cesium.** Pas
de `scene.requestRender()`, pas de travail de scène. Le coût globe est inchangé
par construction, pas par mesure. Au repos (pointeur hors piste), la loupe est
`hidden`, le tick saute tout son travail, et le profil est **exactement celui
d'aujourd'hui**.

## 4. Plan d'implémentation

Ordre imposé : **P0 seul d'abord**, sans changement visuel, pour absorber le
churn de tests avant que quoi que ce soit ne bouge à l'écran.

### P0 — extraire la géométrie de piste (aucun changement visuel)

Nouveau fichier `src/features/revisit/ui/passSpans.ts`, une fonction pure et
sans unité :

```ts
export interface PassSpan { x: number; width: number; interval: AccessInterval }

/** Fractions de [t0, t1] — l'appelant les convertit en % ou en px.
 *  `minWidth` est exprimé dans la même fraction : la piste passe 0.0012
 *  (le plancher actuel), la loupe passe 1 / largeurEnPx. */
export function passSpans(
    intervals: AccessInterval[], t0: number, t1: number, minWidth: number,
): PassSpan[]
```

Elle clippe à `[t0, t1]`, rejette les longueurs nulles, et se branche sur un
index mémoïsé (voir P1) quand il lui est fourni. `accessTrack` de
`CoverageRibbon.tsx` l'appelle avec `minWidth = 0.0012` et produit exactement
les mêmes rects qu'aujourd'hui.

Tests `src/features/revisit/__tests__/passSpans.test.ts` : durées exactes,
intervalle à cheval sur `t0`, sur `t1`, intervalle entièrement hors plage,
plancher appliqué / non appliqué, plage dégénérée `t0 === t1`.
Garde : suites existantes vertes, gate visuel inchangé au pixel.

### P1 — `CoverageLens`, pur et impératif

Nouveau `src/features/revisit/ui/CoverageLens.tsx` :

```ts
export interface CoverageLensHandle {
    /** `null` masque la loupe et rend le tick gratuit. */
    update(hoverMs: number | null): void;
}
```

Props stables uniquement (`intervals`, `windowStartMs`, `windowMs`, `spanMs =
3600_000`, `color`, `onSeek`), composant `React.memo` + `forwardRef` +
`useImperativeHandle`. Internes :

- **pool fixe** de `MAX_LENS_TICKS = 64` `<rect>` créés une fois, conservés dans
  un tableau de refs ; `update()` n'écrit que `x`, `width` et `hidden` ;
- **index mémoïsé** sur l'identité de `intervals` : un `Float64Array` des
  `endMs`. Après `unionAccessIntervals` les intervalles sont disjoints et
  ordonnés, donc les fins le sont aussi et une recherche binaire (`lowerBound`
  sur `t0`) donne le premier candidat en O(log n). La construction de l'index
  vérifie la monotonie une fois ; si elle échoue, un drapeau fait retomber sur
  un filtrage linéaire plutôt que sur un résultat faux ;
- **lecture** : empan et échelle (« 1 h · 12 s/px »), bornes AOS/LOS, durée du
  passage sous le pointeur en secondes, écart au prochain passage. Écrites par
  `textContent`, jamais par du state.

Tests `CoverageLens.test.tsx` : géométrie via `update()` appelé à la main,
plafond des 64 ticks, bascule densité au-delà, masquage sur `null`, absence de
rendu React entre deux `update()`.

### P2 — câblage impératif dans `CoverageRibbon`

Tout se greffe sur la surface `seekRef` existante, qui est déjà
`pointer-events-auto` et **déjà exactement large comme la piste** (le correctif
d'offset de ~100 px documenté dans le fichier).

- refs : `hoverXRef` (number | null), `lensRef`, `trackBoxRef` ({ left, width });
- `pointermove` attaché par `addEventListener(..., { passive: true })` dans un
  effet, **pas** en prop React : on évite le système d'événements synthétiques
  au rythme du pointeur ;
- `pointerenter` lit `getBoundingClientRect()` une fois et pose
  `will-change: transform` ; `pointerleave` remet `hoverXRef` à `null`, provoque
  une dernière `update(null)` et **retire** `will-change` ;
- `ResizeObserver` sur `seekRef` rafraîchit `trackBoxRef` — seule autre source
  de lecture de layout ;
- dans la rAF **existante**, juste après l'écriture du playhead :

```ts
const x = hoverXRef.current;
if (x !== lastHoverX) {
    lastHoverX = x;
    lensRef.current?.update(x === null ? null : msFromClientX(x));
}
```

Aucune dépendance nouvelle de l'effet, aucun `setState`.

### P3 — seeker à la précision de la loupe, et parité hors survol

- clic dans la loupe → `onSeek` à ~12 s/px au lieu de ~3 min/px, suivi de
  `onSetSpeed(0)` — même convention que `handleDateTimeChange`, qui met déjà en
  pause après un instant saisi à la main ;
- variante **ancrée au playhead** : la même `CoverageLens` alimentée par
  `getTimeMs()` au lieu du pointeur, permanente, pour le tactile
  (`MobileResultStrip`) et le clavier (flèches = 1 h aujourd'hui). En lecture
  elle se met à jour au fil de l'horloge : seuil de mise à jour à 1 px de loupe
  (~12 s de temps simulé) pour ne pas réécrire 64 attributs à chaque frame.

### P4 — gate de performance

Voir §5. Nouveau `e2e/revisit-lens.spec.ts` pour les mesures 2 et 3, vitest pour
1 et 4.

Optionnel, hors périmètre initial : sous-lignes par satellite dans la loupe
depuis `AccessInterval.satelliteIds` — c'est seulement à ce zoom qu'on voit
qu'un « trait » est deux satellites fusionnés.

## 5. Comment la non-régression est **prouvée**

`docs/REVISIT_FOREGROUND_PERFORMANCE.md` est la raison de cette section : R12
est resté ouvert des mois parce que sa performance avait été *déduite du code*
et non mesurée, et deux audits l'ont refusée pour ça. On ne recommence pas.

Quatre mesures, avant / après, sur le profil OneWeb HLD :

1. **Rendus React.** Compteur de rendus de `CoverageRibbon` pendant un balayage
   de 5 s en survol : doit rester **égal au régime actuel** (les mises à jour
   ARIA à 2 Hz), soit 0 rendu imputable à la loupe. Vitest, instrumentation de
   test uniquement.
2. **Durée du tick rAF.** `performance.measure` autour du tick :
   budget **loupe ≤ 0,2 ms p95**, tick total ≤ actuel + 0,3 ms. Rappel de
   méthode tiré du même document : le pane d'automatisation est `hidden` et
   n'émet **aucune** rAF — la mesure se fait en appelant le tick directement,
   comme l'a fait la mesure R29c.
3. **Allocations.** `window.__memStats` (moniteur mémoire dev) avant/après 60 s
   de survol continu : croissance nulle en régime établi. C'est le pool de
   nœuds pré-alloués qui doit rendre ce résultat vrai ; s'il ne l'est pas, le
   pool est mal fait.
4. **Globe inchangé.** Assertion structurelle : aucun appel à
   `scene.requestRender()` depuis le chemin ruban. Plus fort qu'une mesure —
   c'est une propriété, pas une observation.

Critère de sortie : les quatre au vert, gate visuel e2e mis à jour
intentionnellement (`e2e/revisit-visual.spec.ts`), suites P0/P1/P7C vertes.

## 6. Risques et garde-fous

- **Distraction en présentation.** Le module se présente en direct (badge
  « Ready to present », `PresentationSafety`). Garde-fous : la loupe n'apparaît
  qu'au-dessus de la piste, ne recouvre jamais la ligne qu'elle agrandit, entre
  avec un délai court (~60–80 ms) et sort immédiatement — pas de scintillement
  au passage de souris.
- **Mauvaise lecture d'un bloc magnifié.** La loupe affiche toujours son empan
  et son échelle ; sans quoi un bloc large y serait lu comme une longue
  couverture.
- **Sémantique de l'union.** Ce que la ligne mesure est « couverture continue
  par la constellation », pas « un satellite balaie la cible ». La loupe doit
  l'étiqueter, ou afficher les deux (§4, optionnel).
- **Churn de tests.** Le gate visuel et les tests de ruban touchent les rects ;
  P0 est conçu pour absorber ce churn avant que quoi que ce soit de visible ne
  change.

## 7. Ce que ce plan ne fait pas

Il ne modifie ni le moteur, ni le worker, ni la donnée : `AccessInterval` porte
déjà des bornes exactes à la sous-seconde (bissection, 24 halvings) et
`satelliteIds`. Tout le travail est du rendu. Il ne change pas non plus le
plancher de la piste principale — à 72 h il reste nécessaire ; c'est la loupe
qui répare la lecture, pas sa suppression.
