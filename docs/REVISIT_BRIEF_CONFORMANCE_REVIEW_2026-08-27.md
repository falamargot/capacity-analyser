# REVISIT — revue de conformité au brief Payload OneWeb

**Date :** 2026-08-27
**Source métier :** `Video simulation Payload Oneweb brief PPJ June 2026_GB copie.docx` (V1, 30 juin 2026 — Paul Petit-Jean / Geoffroy Brichler, Engineering & Innovation)
**Objet :** vérifier que le fonctionnel implémenté couvre *totalement* le brief ; lister le manquant, l'améliorable et le bonus.
**Méthode :** lecture intégrale du DOCX, revue du code (`src/features/revisit/**`, 25 500 lignes), revue des ADR/plans, et validation navigateur du module en 1600×1000 (dev server port 3000).
**Remplace :** `REVISIT_REQUIREMENT_RECHECK_2026-08-12.md`, dont les actions P0/P1/P2 sont désormais fermées.

---

## 1. Verdict

**Le brief est couvert en totalité sur les entrées, les sorties et la mise en scène.** Les
quatre écarts identifiés le 12 août (géométrie FOV non éditable, saisie lat/lon absente,
noms satellites absents, horloge sans play/pause) sont tous fermés et vérifiés en
navigateur ce jour.

**Mais la conformité ne peut pas être déclarée « sûre sur tous les parcours » :** une revue
croisée a mis au jour un **défaut de cache dans le worker** qui peut publier un KPI de
revisite calculé sur la mauvaise constellation. Voir §1bis — reproduit et mesuré
indépendamment. Ce défaut n'était pas dans la première version de cette revue.

Hors ce défaut, il ne reste **aucun requirement non implémenté**. Ce qui subsiste relève de
trois catégories : (a) des **bornes de capacité** plus étroites que la lettre du brief
(nombre de cibles simultanées, plafond de labels), (b) des **choix d'interprétation**
sur des points où le brief est ambigu, et (c) des **défauts de finition** dont un
seul est visible en démonstration.

Le module dépasse largement le brief sur la crédibilité du modèle (profil HLD complet
avec seam, échelle d'altitudes et spares, WGS84, Kepler+J2 recoupé GMAT/SGP4) et sur
la couche commerciale (dimensionnement automatique, courbe de valeur, export client,
comparaison de cibles, heatmap de zone) — voir §5.

---

## 1bis. P0 — la clé de cache de constellation est incomplète

**Où :** `analysis/runScenario.ts:64` (`walkerKey`), consommé par
`workers/revisitWorker.ts:26` (cache au niveau module, persistant entre messages).

**Le défaut.** `walkerKey` ne retient que les scalaires
`pattern | planes | satsPerPlane | inclinationDeg | altitudeKm | phasingF | fudge | raan0Deg`.
`generateWalkerConstellation` consomme en plus **`planeAltitudesKm`, `raanOffsetsDeg`
et `sparesPerPlane`** — exactement les trois tableaux qui font la fidélité du profil HLD
(ladder 1175–1219 km, seam 12,525°, 58 spares). Deux specs structurellement différentes
mais de scalaires identiques partagent donc la même clé, et le worker sert la flotte
précédente.

**Reproduit et mesuré** (probe jetable, `runRevisitScenario` avec et sans cache empoisonné,
Londres, fenêtre 24 h, pas 10 s, `DEFAULT_SELECTION`) :

| | Flotte HLD (cache) | Walker nu attendu |
|---|---|---|
| Satellites générés | **634** | **576** |
| Demi-grand axe plan 0 | 7553,137 km | 7578,137 km |
| RAAN plan 1 | 15,225° | 15,000° |

Résultat pour **le même scénario** : gap maximal **21 263 044 ms** avec le cache empoisonné
contre **21 560 982 ms** à froid, soit un écart de **4 min 58 s**, et **8 accès contre 9**.
L'amplitude dépend du scénario (une revue croisée mesure ~18 min sur un autre jeu) ; le
mécanisme, lui, est constant.

**Ce qui est touché, et ce qui ne l'est pas.** Seuls les trois chemins qui reçoivent le cache
du worker peuvent devenir faux : `runRevisitScenario` (le **KPI de tête**),
`areaAnalysis` (la **heatmap de zone**) et `compareRevisitTargets` (la **comparaison de
cibles**). En revanche `RevisitApp.tsx:455` régénère la flotte du globe **sans cache** et
`payloadSweep.ts:139` appelle `generateWalkerConstellation` directement. C'est la pire
forme possible du défaut : **l'image et la recommandation restent justes pendant que le
chiffre affiché est faux**, donc rien à l'écran ne signale l'incohérence.

**Chemin d'atteinte.** `isRevisitSessionSnapshot` ne valide `scenario.reference` que par
`Boolean(...)` — aucun contrôle de champ. Un scénario sauvegardé, partagé en JSON, importé,
produit par un build antérieur à R29, ou construit en mode `Custom`/`Measured` avec les
mêmes scalaires que le profil HLD mais sans ses tableaux, est accepté tel quel et collisionne.

**Correctif.** Inclure la spécification structurelle complète dans la clé — les trois
tableaux sérialisés, pas seulement leur présence — et ajouter des tests de non-régression
pour l'ajout, la suppression et la modification de chacun. `walkerSpecsEqual`
(`referenceProfiles.ts`) compare déjà exactement ces trois tableaux : la logique existe,
elle n'est simplement pas utilisée ici.

---

## 2. Matrice brief → implémentation

### 2.1 Constellation de référence

| Brief | État | Où / constat |
|---|---|---|
| Walker « Star » (180°) ou « Delta » (360°) | ✅ | `domain/walker.ts` `raanSpanDeg`; champ `Pattern` dans Expert settings |
| Nombre de plans P | ✅ | Champ `Planes P`, borné et validé |
| Satellites par plan S | ✅ | Champ `Sats / plane S`; `Total` recalculé (576) |
| Inclinaison (deg) | ✅ | Champ `Inclination °` |
| Altitude (km) | ✅ | Champ `Altitude km` + échelle par plan 1175–1219 km |
| Facteur `f` (phasage) | ✅ | Champ `Phasing f`; warning explicite si non entier |
| Facteur `fudge` (écart inter-plans) | ✅ | Champ `Fudge`; éditer `fudge` détache `raanOffsetsDeg` (`referenceEditing.ts`) — le contrôle n'est jamais inerte |
| Espacement 15,225° / seam 12,525° | ✅ **bonus** | `HLD_RAAN_OFFSETS_DEG` : 11 × 15,225 + 12,525 = 180,000 exactement |
| 634 satellites (576 actifs + 58 spares) | ✅ **bonus** | Affiché en tête : `576 active + 58 spare · 634 total`; les spares sont propagés, dessinés et **structurellement** inéligibles au payload |
| Séparation 4 km entre plans | ✅ **bonus** | `HLD_PLANE_ALTITUDES_KM`, ladder de 12 barreaux; Ω̇ ∝ a^−3.5 réellement différencié |

### 2.2 Sous-constellation porteuse

| Brief | État | Où / constat |
|---|---|---|
| 1 plan sur x, x diviseur de P | ✅ | `Plane stride x` est une **liste des diviseurs réels de P** — un x illégal est inexprimable |
| 1 satellite par plan sur y, y diviseur de S | ✅ | Idem `Sat stride y` |
| z-ième satellite dans les plans suivants | ✅ (interprétation, §4.1) | `s = (k·z + j·y) mod S`, k = index du plan **sélectionné** |
| Règles de divisibilité respectées | ✅ | `validateSelection` + `reconcileSelection` réparent au lieu de jeter |

### 2.3 Instrument (FOV)

| Brief | État | Où / constat |
|---|---|---|
| Biais par rapport au NADIR | ✅ | `Along-track bias °` et `Cross-track bias °` |
| FOV ellipse ou rectangulaire | ✅ | `FOV shape` (Ellipse / Rectangle) |
| Deux demi-angles vus du satellite | ✅ | `Half-angle 1 °`, `Half-angle 2 °` |
| Une rotation autour de la direction NADIR | ✅ (interprétation, §4.2) | `Clocking °` — rotation autour du **boresight biaisé** |
| Swath de la caméra | ✅ | Presets `Narrow 350 / Standard 700 / Wide 1400 km`, recalculés à l'altitude courante |
| Masque d'élévation | ✅ **bonus** | Optionnel, hors brief |

### 2.4 Cibles et fenêtre

| Brief | État | Où / constat |
|---|---|---|
| Point défini par latitude / longitude | ✅ | Saisie numérique bornée (−90..90 / −180..180) + presets + clic globe |
| Zones : série de latitudes/longitudes | ✅ | Dessin sur globe, collage d'une liste lat/lon, import GeoJSON Polygon; analyse sur grille + heatmap |
| Plusieurs emplacements sur Terre | ⚠️ **partiel** | 1 cible de référence + **1** seule cible de comparaison (`MAX_SECONDARY_TARGETS = 1`) |
| Durée de propagation | ✅ | `Duration h` (défaut 72 h) + `Step s`, avec avertissement sous 24 h |

### 2.5 Paramètres de visualisation

| Brief | État | Où / constat |
|---|---|---|
| Tracer ou non les orbites | ✅ | Toggle `Orbits` — un anneau par plan, plans porteurs colorés différemment |
| Tracer ou non les FOV | ✅ | Toggle `Sensor swath` (+ `Projection cones` en bonus) |
| Toute la constellation ou seulement les porteurs | ✅ | Toggle `Host fleet` |
| Afficher ou non les noms satellites (`px_sy`) | ⚠️ **partiel** | Toggle `Satellite labels`; format `P00_S00`; **porteurs uniquement**, plafonné à 96 |

### 2.6 Sortie

| Brief | État | Où / constat |
|---|---|---|
| 3D, Terre en rotation | ✅ | Globe Cesium; rotation terrestre réelle dans la physique (`earthRotationRad`), `Auto-rotate globe` distinct et nommé comme tel |
| Satellites porteurs mis en évidence | ✅ | Porteurs blancs/ambre, flotte hôte atténuée, spares distincts |
| Swath dans une couleur spécifique | ✅ | Empreinte ambre projetée sur l'ellipsoïde WGS84 (pas une approximation sphérique) |
| Point de latitude spécifique + revisit écrit en bas | ✅ (adapté) | Cible labellée sur le globe; le revisit est en colonne droite (plus lisible) et le **gap maximal est dessiné sur la timeline basse** |
| Horloge + avance/recul | ✅ | `Play/Pause`, `−1 h`, `+1 h`, vitesse `1× / 10× / 100×`, horodatage **UTC éditable**, seek clic/clavier (←/→, PgUp/PgDn, Home/End) |

---

## 3. Ce qui manque

Aucun requirement du brief n'est absent. Les manques sont des **bornes** et des
**finitions**.

### M1 — Une seule cible de comparaison (impact : moyen)
`domain/analysisTargets.ts:25` fixe `MAX_SECONDARY_TARGETS = 1`. Le brief demande
« Several locations on Earth ». On peut donc comparer Londres à *une* autre ville,
pas construire le tableau latitude équateur → moyenne → arctique en une vue, qui est
pourtant le meilleur argument de la constellation quasi-polaire. La persistance
accepte déjà 2 secondaires (`MAX_PERSISTED_SECONDARY_TARGETS = 2`), le worker
sérialise les sweeps et le cache est partagé sur clé physique : passer à 2 ou 3 est
un changement de constante plus un ajustement de la sidecar de comparaison.

### M2 — Labels satellites restreints (impact : faible)
`MAX_SATELLITE_LABELS = 96` et **seuls les porteurs** sont étiquetés
(`useRevisitScene.ts` `populateSatelliteLabels`). Le brief dit « Show or not
satellites names », sans restriction. C'est un arbitrage lisibilité/GPU défendable
(634 labels = nuage illisible), mais il n'est pas dit à l'écran : un utilisateur qui
active le toggle et ne voit pas de nom sur la flotte hôte conclut à un bug.
Correctif : mentionner « porteurs uniquement » dans le hint du toggle.

### M3 — Aucune cible au démarrage (impact : moyen, perception)
Vérifié en navigateur : REVISIT s'ouvre sur `No analysis target` / `No target
selected`, avec une timeline vide. `presets.ts` pose pourtant en principe
(« UX §6 ») que le mode ne doit jamais ouvrir sur un formulaire vide et le brief
demande une démonstration immédiate à des dirigeants non techniques. Les cinq
premières secondes d'une démo sont dépensées à ajouter Londres à la main.
Correctif : semer la cible de référence Londres au premier montage (l'état
« vide » reste atteignable par `Reset scenario`).

### M4 — Le nommage n'est pas celui du brief (impact : cosmétique)
Le brief propose `px_sy` « for the yth satellite of plane x ». L'implémentation
produit `P00_S00`, **indices à base zéro**, documenté dans `types.ts`. Un plan « 1 »
du brief est le plan `P00` à l'écran. À trancher explicitement plutôt qu'à subir.

### M5 — Robustesse réseau du démarrage applicatif (impact : élevé en démo, hors REVISIT)
Constaté pendant cette revue : sans accès à CelesTrak, **toute l'application reste
bloquée sur `Loading satellite data and coverage…`**. `services/satelliteService.ts`
appelle `fetch(CELESTRAK_API[...])` **sans timeout ni AbortSignal** ; la chaîne de
repli (cache périmé → fichier statique embarqué) n'est jamais atteinte tant que la
requête ne rend pas la main. La revue n'a pu se poursuivre qu'en forçant
`VITE_FORCE_LOCAL_CELESTRAK=true`. Ce n'est pas du code REVISIT, mais c'est le
risque de démonstration le plus élevé du dépôt : sur un réseau invité filtrant,
la simulation ne s'affiche pas du tout. Correctif : `AbortSignal.timeout(5000)`
sur les deux fetch TLE.

---

## 4. Choix d'interprétation à faire valider par les auteurs du brief

### 4.1 Le décalage `z` est cumulatif
Le brief écrit : « in the subsequent planes, one shifts the selection […] the z_th
one, which is at `f·360/(P·S) + z·360/S` ». La formule citée décrit le **premier**
plan suivant. L'implémentation généralise en `k·z` (`subConstellation.ts`) : chaque
plan sélectionné décale d'un cran de plus, ce qui produit le motif en escalier
attendu d'une sous-constellation. L'autre lecture — décalage fixe `z` pour tous les
plans suivants — est également recevable et donnerait un motif différent. À
confirmer ; le coût du changement est d'une ligne.

### 4.2 Le clocking tourne autour du boresight, pas du nadir
Le brief dit « one rotation around NADIR direction ». Avec un biais non nul, le
boresight n'est plus le nadir ; le code fait tourner la FOV autour du **boresight
biaisé** (`containment.ts` `resolveFov`), ce qui est la convention instrument
usuelle (l'axe de roulis du détecteur suit la visée). Sans biais, les deux
conventions coïncident — donc l'écart n'existe que dans le cas biaisé.

### 4.3 Le nombre de payloads est contraint aux produits de diviseurs
Conséquence directe des règles x/y du brief lui-même : les paliers possibles à
P=12, S=48 sont 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 36, 48, 64, 72… Une topologie du
type « 8 payloads répartis sur 12 plans » n'est pas exprimable (elle exigerait
0,67 payload par plan). Le slider et l'annotation « 4 planes × 3 per plane » le
rendent visible, mais il faut le savoir avant une démonstration.

### 4.4 Ellipse testée en espace tangent
`(tanα/tanθ₁)² + (tanβ/tanθ₂)² ≤ 1` plutôt que sur les angles. Déviation
délibérée et documentée (`DEFERRED_ITEMS.md` R2) : elle rend le cas θ₁ = θ₂
**exactement** égal au cône circulaire de validation analytique. À conserver.

---

## 5. Ce que le module fait en bonus

Tout ce qui suit est hors brief.

**Fidélité du modèle**
- Profil de référence **versionné et signé** (`ONEWEB_HLD_V1 v1.0.0`) avec un drapeau
  `isAuthoritative` : une coquille illustrative ne peut pas se faire passer pour la vraie.
- Seam Walker Star, échelle d'altitudes par plan, 58 spares non porteurs — les trois
  absents d'un Walker paramétrique naïf.
- Terre **WGS84** partout : horizon cible sur la normale ellipsoïdale, empreinte
  dessinée par intersection rayon/ellipsoïde exacte, deux « verticales » distinctes
  et documentées.
- Propagation Kepler + **J2 séculaire**, recoupée contre **NASA GMAT** (−9 km sur 72 h)
  et contre **SGP4** (gap maximal à mieux que 2 %). Le cross-check GMAT a révélé deux
  vrais bugs de propagateur que 1850 tests internes n'avaient pas vus.
- **Calibration sur les TLE réels** OneWeb (`fitWalker.ts`) : ajuste P, S, i, h, f, fudge
  sur la flotte en orbite et publie le résidu, avec un mode `MEASURED` dans l'UI.

**Analyse**
- **Sweep de dimensionnement** : le moteur tourne sur toute l'échelle de topologies et
  répond « il vous faut N payloads », avec la répartition mesurée — jamais déduite d'une
  règle empirique (concentrer bat étaler à 55° et 87,9°, mais étaler gagne à 70° : aucune
  heuristique testée ne reproduit ce comportement, d'où le sweep).
- **Enveloppe exécutive** monotone (`executiveEnvelope.ts`) sans point synthétique :
  seuls des résultats réellement mesurés sont conservés.
- Statistiques complètes : gap max (worst-case contractuel), moyen, p95, passages/jour,
  fraction en visibilité, **gaps tronqués aux bornes explicitement écartés**.
- **Analyse de zone** sur grille avec heatmap, pire cellule identifiée en lat/lon.
- **`Why this revisit`** : facteur limitant établi **uniquement sur preuve moteur**, et
  `NOT_DETERMINED` quand rien ne l'étaye — plutôt qu'une explication plausible.
- Comparaison de cibles avec pistes d'accès superposées sur la même timeline.

**Produit / démonstration**
- Carte résultat orientée client, recommandation applicable en un clic avec retour arrière exact.
- Scénarios nommés (12 max), partage JSON, import.
- Exports : **résumé client**, CSV des accès, CSV du sweep, CSV de la grille de zone.
- **`Presentation readiness check`** : vérifie avant la réunion que rien n'est en cours
  de calcul ou contradictoire.
- **Contrat de fraîcheur** : aucun bloc ne peut afficher un résultat qui ne correspond
  pas à ses propres entrées.
- Ordonnanceur de sweep unique : une exécution à la fois, requêtes identiques fusionnées,
  cache sur clé **physique** (le nom d'affichage exclu) — comparaison aux mêmes
  coordonnées servie en < 3 s au lieu d'un second sweep de ~25 s.
- Panneau de provenance : `Kepler + J2 · WGS84 · GMAT-checked`, et la qualification
  « illustrative IR preset — not an instrument datasheet » reste visible à l'export.
- 2095 tests unitaires, 137 tests e2e sur 4 viewports, gates tsc/eslint verts.

---

## 6. Améliorations recommandées, par priorité

| # | Action | Effort | Motif |
|---|---|---|---|
| ~~A0~~ | ✅ **Corrigé le 2026-08-28** — clé dérivée des propres clés de la spec + 13 tests de non-régression | S | §1bis |
| ~~A1~~ | ✅ **Corrigé le 2026-08-28** — `AbortSignal.timeout(5 s)` sur l'appel CelesTrak live | XS | M5 |
| A2 | Semer Londres comme cible de référence au premier montage | XS | M3 — le brief exige un résultat immédiat pour un public dirigeant |
| ~~A3~~ | ✅ **Corrigé le 2026-08-28** — `fovForDisplay` arrondit la graine de l'éditeur à 2 décimales | XS | Vérifié à l'écran : `16,13` |
| A4 | Porter `MAX_SECONDARY_TARGETS` à 2–3 | S | M1 — « several locations », et l'effet latitude est le meilleur argument |
| A5 | Dire dans le hint que les labels ne couvrent que les porteurs | XS | M2 |
| A6 | Faire trancher §4.1 (z cumulatif) et §4.2 (clocking) par les auteurs | — | Lever l'ambiguïté avant qu'un chiffre soit cité |
| A7 | Presets FOV issus d'une vraie datasheet | M | Déjà noté ; bloquant pour tout chiffre communiqué au client |

---

## 7. Conclusion

Le brief est **entièrement couvert** au sens fonctionnel, et le moteur est nettement plus
rigoureux que ce que le brief demandait. Mais **A0 interdit de qualifier le module de
totalement conforme et sûr** : sur les parcours qui changent, restaurent ou importent un
modèle de constellation, le chiffre publié peut être calculé sur une autre flotte que celle
dessinée. A0 d'abord ; A1 et A2 ensuite, seules autres actions capables de gâcher une
démonstration.

### Note de méthode

La première version de cette revue déclarait la conformité « totale » et n'avait pas vu A0.
La matrice brief → implémentation a été construite en lisant les **entrées** (UI, domaine,
géométrie) ; A0 vit dans le **chemin d'exécution** (identité de cache entre deux messages
worker), que cette lecture ne traverse pas. Une revue de conformité par matrice ne
substitue pas à une revue du flot de données : les deux sont nécessaires.


---

## 8. Correctifs appliqués — 2026-08-28

Trois actions fermées. Gates : **2135 tests unitaires** (+40), `tsc` et `eslint`
propres, `revisit-p1` + `revisit-advanced` verts sur `desktop-chromium` (13 passés,
1 ignoré).

### A0 — clé de cache de constellation

`walkerKey` n'est plus une liste écrite à la main. Elle est **dérivée des propres
clés de la spec**, triées, donc exhaustive par construction : un champ ajouté
demain à `WalkerSpec` entre dans la clé sans que personne n'ait à y penser.
`raan0Deg` est normalisé (absent ≡ 0) ; tout autre champ absent est émis comme
absent et ne peut donc pas être confondu avec une valeur présente. L'asymétrie est
documentée en tête de la fonction : sur-cléer coûte une régénération inutile,
sous-cléer rend la mauvaise constellation.

**16 tests de non-régression**, écrits contre la *conséquence observable* (une autre
flotte, une autre statistique) et non contre la chaîne de clé, donc ils tiennent si
l'encodage change encore :

- la flotte HLD n'est pas servie à un Walker nu de mêmes scalaires (634 vs 576) ;
- pour **chacun** des trois tableaux : ajout, suppression, modification d'une seule
  entrée → régénération ; tableau identique mais nouvel objet → réutilisation ;
- absent ≡ explicitement `undefined` ;
- un champ inconnu de la spec entre bien dans la clé — c'est le garde-fou contre la
  récidive ;
- bout en bout : deux analyses dans un même cache persistant donnent les mêmes
  statistiques et la même sélection qu'un cache froid.

**Vérifié que ces tests échouent contre l'ancienne clé** : 12 des 16 rouges après
restauration temporaire de l'ancienne implémentation, verts après. Les quatre autres
(tableau identique mais nouvel objet, absent ≡ `undefined`) passent sous les deux
implémentations : elles pinnent la réutilisation, pas l'invalidation. Un test de
non-régression qui n'a jamais échoué ne prouve rien.

### A1 — deadline sur l'appel CelesTrak

`fetchWithTimeout(url, 5 s)` sur l'appel live, avec repli sur `AbortController` là
où `AbortSignal.timeout` manque. Le point important n'est pas le timeout en
lui-même mais ce qu'il débloque : la ladder à quatre étages de `fetchTLE` (cache
frais → API live → cache périmé → fichier embarqué) était **inatteignable sous
l'étage 2**, parce qu'un réseau filtrant n'refuse pas la connexion, il l'avale.

**Vérifié en navigateur, sans le contournement `VITE_FORCE_LOCAL_CELESTRAK`** :
CelesTrak est effectivement injoignable dans cet environnement (`TimeoutError` à
5021 ms, mesuré depuis la page), et l'application atteint désormais
`Startup complete.` avec **680 satellites chargés depuis le fichier embarqué**. Avant
le correctif, le même environnement restait indéfiniment sur
`Loading satellite data and coverage…`.

**7 tests de non-régression** (`src/services/__tests__/tleFetchTimeout.test.ts`).
Le point de méthode : **chaque stub rend une promesse qui ne se résout jamais**, et
qui ne rejette qu'à l'abort. C'est la seule forme qui reproduise le défaut — un
`fetch` stubé pour rejeter serait passé contre le code cassé aussi, puisque la
ladder gérait déjà le rejet ; ce qu'elle ne gérait pas, c'est le *pending*.

Trois couvrent le mécanisme (`fetchWithTimeout` rejette un fetch qui ne répond
jamais ; le signal remis à `fetch` est réellement `aborted`, donc la connexion est
relâchée et pas seulement ignorée ; une réponse saine passe telle quelle), une
épingle les 5 s de production, et trois couvrent le câblage : la ladder retombe sur
le fichier embarqué, elle **termine**, et une réponse live est rendue intacte.

`fetchTLE` prend un `timeoutMs` optionnel — défaut `CELESTRAK_FETCH_TIMEOUT_MS`.
C'est une couture de test, pas une branche de test : les tests pilotent la vraie
ladder en 25 ms au lieu de 5 s, sans que le code sous test contienne un chemin
particulier.

**Vérifié que ces tests échouent sans le correctif** : après restauration
temporaire du `fetch` sans deadline, les deux tests de ladder **expirent à 5 000 ms**
— très exactement le symptôme de production. Les trois tests de `fetchWithTimeout`
restent verts, cette fonction étant inchangée : ils couvrent le mécanisme, les
tests de ladder couvrent le câblage.

**Résidu non traité, délibérément :** `services/satcatService.ts:202` appelle le CSV
SATCAT live sans deadline. Ce fetch n'est atteint qu'en **dernier recours**, après
échec du fichier statique embarqué *et* du cache — donc sur un build cassé, pas sur
un réseau filtrant. Même classe de défaut, probabilité et impact très inférieurs ;
signalé plutôt que corrigé pour ne pas élargir le périmètre sans le dire.

### A3 — demi-angles lisibles

`ui/fovDisplay.ts` — `fovForDisplay` arrondit les deux demi-angles à 2 décimales.

Le point de conception est **où** l'arrondi s'applique : sur la valeur qui
**amorce** l'éditeur, jamais sur ce que l'utilisateur tape. Un arrondi à l'affichage
sur un input contrôlé effacerait silencieusement la troisième décimale au moment de
la frappe. Amorcer à la place donne trois propriétés, toutes vérifiées à l'écran :

| Propriété | Mesure |
|---|---|
| Le champ est lisible | `16.13` au lieu de `16.13021207267992` |
| L'arrondi ne simule pas une édition en attente | `Apply geometry` et `Revert` **désactivés** à l'ouverture |
| La frappe n'est pas altérée | `20.125` saisi reste `20.125`, `Apply` s'active |

L'instrument garde son nom de preset (`Standard · 700 km`) parce que
`fovPresetNameFor` compare sur une tolérance relative de swath et non sur l'égalité ;
2 décimales déplacent un swath de 700 km d'environ dix mètres.
