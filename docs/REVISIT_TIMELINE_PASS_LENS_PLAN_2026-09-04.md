# REVISIT — Loupe temporelle sur la timeline : plan d'exécution

_Proposition, 2026-09-04. **Non implémentée.** Contrainte imposée : aucune perte
de performance, démontrée par mesure et non par raisonnement._

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

## 4. Découpage

**P0 — extraire la géométrie de piste, sans changement visuel.**
Une fonction pure `passRectsForRange(intervals, t0, t1, widthPx, minPx)` rendue
commune à la piste principale (minPx = plancher actuel) et à la loupe
(minPx = 1). Tests unitaires sur des durées exactes, y compris le cas fusionné
et les intervalles clippés aux bords. Garde : la suite existante reste verte et
le gate visuel ne bouge pas d'un pixel.

**P1 — `CoverageLens`, pur.**
Rendu d'une sous-plage donnée : ticks à l'échelle, bornes AOS/LOS, durée en
secondes, écart au prochain passage, étiquette d'échelle (« 1 h · 12 s/px »).
Tests unitaires de géométrie et de contenu. Aucun câblage.

**P2 — câblage impératif.**
Poignée `update()`, `pointerenter/move/leave` sur la surface `seekRef`
existante (déjà `pointer-events-auto` et déjà exactement large comme la piste),
branchement dans la rAF existante, `ResizeObserver`, pool de nœuds. C'est ici
que le budget du §3 se gagne ou se perd.

**P3 — seeker à la précision de la loupe, et parité hors survol.**
Clic dans la loupe → `onSeek` à ~12 s/px au lieu de ~3 min/px. C'est la moitié
la plus utile de la fonction : voir la vérité sans pouvoir s'y poser ne résout
rien. Le survol n'existe ni au tactile (`MobileResultStrip`) ni au clavier
(flèches = 1 h) : la même `CoverageLens` est réutilisée **ancrée au playhead**
comme voie de détail permanente. Même composant, deux déclencheurs.

**P4 — gate de performance.** Voir §5.

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
