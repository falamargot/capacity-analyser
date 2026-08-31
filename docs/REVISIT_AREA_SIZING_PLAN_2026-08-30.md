# REVISIT — dimensionner une zone : plan d'implémentation

**Date :** 2026-08-30
**Statut :** A, B, M1, M2, M3 et M5 implémentés et mesurés ; M4 tranché par la mesure (§3 ter) — le déclenchement reste manuel
**Origine :** en mode polygone, la carte affiche `ASSESSMENT REQUIRED` même sur une
zone de 4 cellules dont l'écart mesuré est 3 h 18 contre une exigence de 2 h. Le
module sait que ça ne passe pas et refuse de dire ce qu'il faudrait.

---

## 1. Pourquoi c'est bloqué aujourd'hui

`customerSizing.ts:113` :

```ts
if (isArea) return hasAreaAnalysis ? { kind: 'AREA_NOT_SIZED' } : { kind: 'UNAVAILABLE' };
```

Le garde-fou est écrit sur la **nature** de la cible, pas sur le coût. Il vient du
Programme 5b : proposer un nombre de payloads sans l'avoir mesuré serait un chiffre
inventé, et une zone n'a pas de balayage. C'est juste — mais le coût qui justifiait
de ne pas en écrire un dépend du nombre de cellules, et le test ne le regarde pas.

### Le coût, mesuré — et la première version de ce plan comptait mal

`enumerateLadder(12, 48)` produit **60 configurations**, 21 comptes de payloads
distincts : 1, 2, 3, 4, 6, 8, 9, 12, 16, 18, 24, 32, 36, 48, 64, 72, 96, 144,
192, 288, 576.

Compter en « runs » est faux, et c'est l'erreur de la première rédaction : le
coût d'un run est proportionnel au **nombre de satellites porteurs**, puisque
`computeAccessIntervals` boucle sur les satellites × les pas. Un run à 576
payloads coûte 576 fois un run à 1 payload. L'unité juste est le **satellite-pas**.

Σ des comptes de payloads sur l'échelle = **3 472**. Un balayage de point coûte
donc 3 472 runs-satellite, non 60, et **30 % de ce total tient dans les trois
rungs les plus chers** (576 + 288 + 192 = 1 056).

Coût unitaire mesuré (Node 24, boucles chaudes, 2 M itérations) :

| opération | µs / appel | dépend de |
|---|---|---|
| `propagateState` | 0,0325 | satellite, instant |
| `targetEciAt` | **0,0433** | **cible, instant — pas du satellite** |
| `isTargetInFov` | 0,0059 | satellite, cible |
| total par satellite-pas | 0,0816 | |

Sur la fenêtre par défaut (25 920 pas), cela donne :

| | satellite-pas | compute pur |
|---|---|---|
| balayage d'un point | 90,0 M | ~7,3 s |
| balayage exhaustif d'une zone de 96 cellules | 8,64 G | ~12 min |

Les « ~25 s » qui circulent dans `HANDOFF.md` sont du temps de bout en bout,
worker et invalidations comprises ; le calcul pur est plus proche de 7 s. Les
« ~40 min » de la première rédaction venaient d'un run moyen supposé à 0,4 s :
c'est **12 min** dans ce modèle. La conclusion — inutilisable — ne bouge pas,
la justification si.

---

## 2. La méthode retenue : sonder puis vérifier

Le produit `cellules × échelle` devient une **somme**.

1. **Sonder.** Balayer l'échelle sur **une seule cellule** — la moins couverte de
   l'analyse de zone courante, que le module identifie déjà (`worstCell`).
   3 472 runs-satellite, ~7 s de calcul pur, **indépendant du nombre de
   cellules**. On obtient une échelle de candidats classés, du moins cher au plus
   cher.
2. **Vérifier.** Prendre le premier candidat et lancer **une** analyse de zone à
   cette configuration — cellules × 1 configuration. Si toutes les cellules
   passent, c'est la réponse. Sinon, candidat suivant.

Coût total, en satellite-pas et non en runs : `Σ_échelle + k × cellules × N`,
avec N le compte de payloads du candidat et k le nombre de candidats essayés.

Pour 96 cellules, un candidat à 72 payloads, fenêtre par défaut :

| | satellite-pas | compute pur |
|---|---|---|
| exhaustif | 8,64 G | ~12 min |
| sonde + 6 vérifications complètes | 1,16 G | ~1 min 35 |
| sonde + 5 échecs à ~5 cellules + 1 vérification complète | 0,32 G | **~26 s** |

Soit **7×** sans sortie anticipée et **~27×** avec. Le gain annoncé (~23×) tient
donc, mais il **dépend entièrement de la sortie anticipée** — ce n'est pas un
détail d'optimisation, c'est ce qui rend la méthode viable. La première
rédaction le présentait comme un bonus.

---

## 2 bis. Deux optimisations du moteur — **implémentées le 2026-08-30**

Elles sortent de la mesure ci-dessus et **ne changent aucun résultat** : mêmes
entrées, mêmes sorties, à l'identique bit à bit. Elles valent pour l'analyse de
point, le balayage et la zone — donc elles se tiennent seules, que le
dimensionnement de zone se fasse ou non.

### A — Mettre en cache la position ECI de la cible par pas

`targetEciAt(target, epochMs, t)` est **l'opération la plus chère du point chaud**
(0,0433 µs contre 0,0325 pour la propagation) et elle **ne dépend pas du
satellite**. Or `computeSatelliteAccess` la rappelle pour chaque satellite à
chaque pas : pour P satellites, la même valeur est recalculée P fois.

Précalculer la table `t → ECI` une fois par run et la relire :

| P (payloads) | coût actuel / pas | avec cache | gain |
|---|---|---|---|
| 12 | 0,979 µs | 0,504 µs | 1,9× |
| 72 | 5,88 µs | 2,81 µs | 2,1× |
| 576 | 47,0 µs | 22,2 µs | 2,1× |

Mémoire : 25 920 pas × 3 flottants = 622 Ko par cible en `Float64Array`, jetés à
la fin du run.

Périmètre exact : **les pas de la grille seulement**. `bisectTransition` évalue
la cible à des instants arbitraires entre deux pas ; ces appels restent tels
quels. C'est une mémoïsation pure — même fonction, mêmes arguments, même
résultat — donc sans effet numérique.

### B — Partager la propagation entre cellules (zone uniquement)

`analyseArea` appelle `computeAccessIntervals` **par cellule**, ce qui
re-propage toute la constellation pour chaque cellule. Le chemin multi-cibles
existe déjà et est éprouvé : `computeAccessIntervalsForTargets` propage une fois
et teste les cibles dans la même boucle, « keeping identical containment and
bisection semantics ». Son plafond `targets.length <= 3` est une **politique du
workflow de comparaison** (il conserve tous les intervalles de chaque cible), pas
une limite numérique.

Avec A + B, une vérification de zone (96 cellules, 72 payloads, 25 920 pas) :

| | par pas | total |
|---|---|---|
| aujourd'hui | 564 µs | ~14,6 s |
| A + B | 47,3 µs | **~1,2 s** |

soit **~12×**, et cela s'applique aussi à l'analyse de zone ordinaire — celle qui
tourne à chaque changement de configuration.

Attention à un basculement : une fois la propagation partagée, c'est le test de
containment (P × C par pas) qui domine. Optimiser la propagation davantage ne
rapporterait alors plus rien.

Contrainte mémoire à respecter : la version multi-cibles conserve les intervalles
par satellite **et** par cible. Pour 96 cellules × 72 satellites, cela doit être
réduit au fil de l'eau — statistiques par cellule, et intervalles conservés pour
la seule pire cellule, ce que `analyseArea` fait déjà (`worstCellIntervals`).
Sans cette précaution, B échange du temps contre une saturation mémoire.

### Ce que je n'ai pas retenu

**Partager la propagation entre les rungs du balayage.** Les 60 rungs
sélectionnent des sous-ensembles de la même flotte de 576 satellites ; en théorie
576 propagations suffiraient au lieu de 3 472. En pratique il faudrait conserver
les états de 576 satellites sur 25 920 pas — 895 millions de flottants, ~7 Go.
Écarté : le seul ordre de boucle qui l'éviterait (satellite à l'extérieur, rungs
à l'intérieur) impose de garder l'état d'ouverture d'intervalle de chaque rung
simultanément, ce qui réécrit `computeSatelliteAccess`. Gain espéré ~1,4× pour
un risque de régression bien supérieur aux deux précédentes.

### Réserves sur les mesures

- `isTargetInFov` a été mesuré avec des entrées constantes : la branche est
  toujours la même et le JIT peut hisser une partie du calcul. **C'est une borne
  inférieure** ; le poids réel du containment est probablement plus élevé, ce qui
  joue *en faveur* de B et *contre* le gain relatif de A.
- `targetEciAt` alloue un `Vec3` par appel ; les 0,0433 µs incluent cette
  allocation, dont le coût réel dépend du GC sous charge. Le cache de A la
  supprime, donc son gain est plutôt sous-estimé.
- Tous les chiffres sont du **calcul pur**, hors worker, sérialisation et
  invalidations. Les temps de bout en bout observés (les « ~25 s » du balayage)
  restent la référence pour ce que voit l'utilisateur.

### Ce que l'implémentation a donné, et ce qu'elle a trouvé

**Mesuré, pas prévu.** Zone de 64 cellules, 36 payloads, fenêtre 72 h @ 10 s :

| | temps |
|---|---|
| implémentation d'origine | 5,53 s |
| A seul (cellule par cellule) | 1,93 s |
| A + B | **1,00 s** |

soit **5,5×** au total — A pèse ~2,5–2,9× sur un point isolé (mesuré sur trois
cibles), B ~1,9× de plus sur la zone. Prévision : 2,1× et 12×. La part de B est
plus faible que prévu parce qu'avec A en place la propagation ne représente plus
la moitié du coût par pas, et parce que le lot de cellules est borné à 12 pour
garder la barre de progression vivante.

**Un défaut réel trouvé par la comparaison bit à bit.** La première exécution du
comparateur a rendu `identical=false` : des écarts de plusieurs secondes sur les
gaps de certaines cellules. Cause — `bisectTransition` écrivait ses états
intermédiaires dans le **tampon de l'appelant**. Dans la boucle mono-cible c'est
inoffensif (l'itération suivante repropage), mais dans la boucle multi-cibles les
cibles suivantes du **même pas** étaient testées contre une position satellite
appartenant à un instant de bissection. Le défaut existait donc **en production
depuis l'écriture du chemin de comparaison** (jusqu'à 3 cibles), pas seulement
dans le nouveau chemin de zone.

Correctif : la bissection a son propre tampon. Test de non-régression ajouté —
le chemin multi-cibles doit rendre exactement les mêmes intervalles que le chemin
mono-cible, cible par cible — et **vérifié falsifiable** : en réintroduisant la
corruption, il échoue.

### Garde-fou de non-régression

A et B doivent être **bit à bit identiques** à l'implémentation actuelle. Le test
à écrire d'abord : sur une fixture de zone et une fixture de point, comparer
`JSON.stringify` de l'analyse produite par les deux chemins. Toute différence,
même sur la dernière décimale, invalide l'optimisation — les tests de
déterminisme existants ne suffisent pas ici, ils comparent un chemin à lui-même.

### Deux accélérations qui viennent avec

- **Sortie anticipée.** Une vérification qui échoue s'arrête à la première cellule
  non conforme. Les candidats trop faibles coûtent quelques cellules, pas toutes ;
  seul le candidat retenu paie la vérification complète. `analyseArea` boucle
  aujourd'hui sur toute la grille sans condition d'arrêt : c'est le seul endroit du
  moteur à modifier.
- **Point de départ gratuit.** L'analyse de zone de la configuration courante est
  déjà calculée — c'est elle qui affiche `least-covered cell`. La sonde part de là.

### Ce que la méthode ne donne pas

Une configuration **vérifiée sur toutes les cellules**, pas prouvée **minimale** :
la cellule contraignante peut changer avec la topologie, donc en montant l'échelle
depuis la pire cellule d'origine on peut dépasser l'optimum d'un cran.

Atténuation : à compte de payloads égal, essayer les répartitions dans l'ordre où
la sonde les a classées avant de monter d'un cran. Quelques vérifications de plus,
l'écart se referme dans la quasi-totalité des cas.

**Conséquence sur le libellé, non négociable** : le résultat s'annonce
« configuration vérifiée sur l'ensemble des cellules », jamais « configuration
optimale ». Le Programme 5b interdisait un chiffre non mesuré ; il n'interdit pas
un chiffre mesuré assorti de sa portée exacte.

---

## 3. Découpage

### M1 — Sortie anticipée dans `analyseArea`

`AreaAnalysisOptions` gagne `stopWhen?: (cell: AreaCellResult) => boolean`. La
boucle `for` de `analyseArea` l'évalue après chaque cellule et rend une analyse
partielle marquée `truncated: true`.

Invariant à tenir : une analyse tronquée **ne doit jamais** alimenter la heat map
ni les KPI — elle ne connaît pas toutes les cellules. Elle ne sert qu'au verdict
« ce candidat échoue ». À faire respecter par le type, pas par la discipline : un
champ `truncated` obligatoire que les consommateurs actuels refusent.

### M2 — Protocole worker

Une requête `area-sizing` dans `revisitProtocol.ts`, à côté de `sweep` et `area` :

```ts
export interface RevisitAreaSizingRequest {
    type: 'area-sizing';
    requestId: number;
    timelineRevision: number;
    scenario: RevisitScenario;   // `target` ignoré, l'aire fournit les points
    area: AreaTarget;
    probeCell: PointTarget;      // la cellule la moins couverte connue
    requirementMs: number;
}
```

Réponse : `{ kind: 'area-sizing', sizing: AreaSizingResult }` avec le compte retenu,
la répartition, le gap vérifié le pire sur la zone, le nombre de candidats essayés
et le nombre de runs consommés — cette dernière valeur est de la télémétrie, jamais
une entrée.

Progression : réutiliser `RevisitAreaProgress` en lui ajoutant une phase
(`'probe' | 'verify'`) et l'index du candidat. Sans cela, l'écran affiche une barre
qui repart à zéro à chaque candidat sans expliquer pourquoi.

**Annulation.** `useAreaAnalysis` remplace déjà son worker pour annuler
(« Replacing the dedicated area worker therefore provides real cancellation »).
Le dimensionnement de zone est plus long que tout ce qui existe : il doit
s'annuler au changement de scénario, de zone, d'exigence et d'instrument, par le
même mécanisme.

### M3 — État de dimensionnement

`CustomerSizing` gagne deux cas, et `AREA_NOT_SIZED` cesse d'être un cul-de-sac :

- `AREA_SIZING` — sonde ou vérification en cours (progression) ;
- `AREA_VERIFIED` — `{ payloadCount, split, worstCellGapMs, candidatesTried }`.

`AREA_NOT_SIZED` demeure pour le seul cas où le dimensionnement n'a pas été lancé
ou a été annulé. `resolveCustomerSizing` traite l'aire avant `hasInspectedPoint`,
comme aujourd'hui, mais rend l'un des trois selon l'état.

Badges : `MORE PAYLOADS REQUIRED` / `RECONFIGURATION REQUIRED` deviennent
atteignables en mode zone, avec le même vocabulaire que pour un point
(`customerVerdict` est partagé avec le PDF — les deux bougent ensemble).

### M4 — Déclenchement

**Pas automatique.** Un balayage de point part tout seul parce qu'il coûte 25 s ;
celui-ci coûte plusieurs minutes sur une grande zone et ne doit pas partir pendant
qu'on dessine un polygone. Un bouton dans `RECOMMENDED CONFIGURATION` —
`Size this area` — sous le texte qui explique aujourd'hui qu'aucun chiffre n'est
proposé, avec le nombre de cellules et une estimation de durée à côté.

### M5 — Restitution

Sous `WHY THIS RECOMMENDATION?`, à côté de la répartition des cellules déjà
présente : les candidats essayés, celui qui a échoué et sur quelle cellule, celui
qui est passé. C'est la preuve du chiffre ; sans elle, une zone dimensionnée n'est
pas plus citable qu'aujourd'hui.

---

---

## 3 bis. Ce que M2 + M3 ont donné (2026-08-30)

Implémentés : `analysis/areaSizing.ts` (sonde + vérification),
`RevisitAreaSizingRequest` et sa progression en deux phases dans le protocole,
`hooks/useAreaSizing.ts` (worker dédié, annulation par remplacement), les états
`AREA_SIZING` / `AREA_VERIFIED` dans `customerSizing`, leur rendu dans la carte,
et un déclencheur manuel `Size this area`.

**Vérifié en navigateur** sur une zone de 9 cellules, exigence 2 h :

```
MORE PAYLOADS REQUIRED
36 payload-equipped satellites  +24
12 planes × 3 per plane · worst cell 1 h 53 min
Verified on every cell of this area. Not proved minimal.
```

**Un défaut de conception trouvé à l'écran, pas en test.** La première version
ordonnait les candidats par nombre de payloads croissant et coupait à six : elle
vérifiait donc les six rungs **les moins chers** — ceux qui ont le moins de
chances de passer — puis annonçait « rien trouvé » sans avoir jamais testé une
configuration viable. Sur la zone ci-dessus elle ne proposait rien.

Correctif, et c'est **exact plutôt qu'heuristique** : la cellule sonde appartient
à la grille, donc une configuration qui rate sur elle a déjà une cellule en
échec — l'aire ne peut pas faire mieux. Les candidats sont filtrés par
`gap sonde ≤ exigence` avant toute vérification. Conséquences :

- une exigence hors de portée coûte **la sonde et rien d'autre** : zéro passe de
  grille dépensée pour confirmer ce que la sonde a prouvé (`probeRejected` le
  chiffre) ;
- le plafond de candidats retrouve son sens : il ne borne plus que le cas où
  plusieurs configurations passent la sonde et échouent ailleurs, et le résultat
  distingue « on a arrêté de chercher » de « rien ne marche ».

**Note sur M1.** La sortie anticipée n'a plus le rôle que le plan lui donnait :
le filtre par la sonde supprime la majorité des vérifications inutiles en amont.
Elle reste utile pour abandonner une vérification dès la première cellule en
échec, mais son gain est désormais à mesurer avant d'être construit.

---

## 3 ter. Mesures sur grille réelle (2026-08-31) — décide M1 et M4

Conditions : constellation HLD 12 × 48, sélection par défaut (12 payloads),
fauchée `Standard`, fenêtre 72 h @ 10 s, machine de développement. Échelle de
60 configurations.

| grille | exigence | sonde | vérifications | **total** | réponse |
|---|---|---|---|---|---|
| 96 cellules | 2 h | 3,25 s | 3 candidats · 5,31 s | **8,6 s** | 48 payloads (12 × 4) |
| 96 cellules | 1 h | 3,19 s | 2 candidats · 7,23 s | **10,4 s** | 96 payloads (12 × 8) |
| 96 cellules | 15 min | 3,13 s | aucune | **3,1 s** | aucune |
| 216 cellules | 2 h | 3,01 s | 2 candidats · 8,32 s | **11,3 s** | 48 payloads (12 × 4) |

Trois faits que ces mesures établissent.

**Le filtre par la sonde fait le gros du travail.** Sur 60 configurations, 46 à
54 sont écartées sans qu'une seule passe de grille soit dépensée. Le cas
inatteignable — exigence à 15 minutes — coûte **la sonde et rien d'autre** :
3,1 s pour répondre « aucune », contre les ~12 min qu'aurait coûtés un balayage
exhaustif.

**La sonde classe bien, mais pas parfaitement**, ce qui valide l'étape de
vérification plutôt que de la rendre superflue : à 2 h, la configuration 12 × 3
tient 1,47 h sur la cellule sonde et échoue à 2,45 h sur l'aire. Deux
configurations à 36 payloads passent la sonde et échouent la grille avant que
48 payloads ne passent. Sans vérification, la carte aurait annoncé 36.

**Le coût est plat en nombre de cellules.** Passer de 96 à 216 cellules ajoute
2,7 s au total (8,6 → 11,3 s) parce que seule la vérification grandit, jamais la
sonde.

### M1 — sortie anticipée : oui, mais ce n'est pas urgent

Économie mesurée sur les cellules vérifiées : **46 %** (96 cellules, 2 h),
**47 %** (216 cellules), **19 %** (96 cellules, 1 h — les échecs y surviennent
tard, cellule 58 sur 96). Rapporté au total avec la sonde, cela représente
2 à 4 secondes sur 9 à 11.

L'économie est réelle et croît avec la grille, mais elle ne change pas la nature
de l'expérience : on reste dans le même ordre de grandeur. Le champ `truncated`
et l'invariant qu'il impose à tous les consommateurs d'analyse restent le prix à
payer. **Recommandation : à faire, mais après M5, et sans urgence.**

### M4 — déclenchement : rester manuel

Entre 8,6 et 11,3 secondes, sans compter le rendu. C'est trop long pour partir
tout seul :

- un dimensionnement automatique se relancerait à chaque déplacement du slider
  de payloads, à chaque changement d'exigence, à chaque sommet ajouté au
  polygone — l'utilisateur paierait des secondes pour des réponses qu'il n'a pas
  demandées ;
- pendant ce temps le worker est occupé et l'analyse de zone ordinaire, celle
  qui tient la heat map, attend derrière.

**Recommandation : garder le bouton.** Ce qu'il mérite en revanche, c'est
d'annoncer le coût — `Size this area · 96 cells, about 10 s` — pour que la
seconde d'attente soit consentie plutôt que subie. C'est une ligne, à faire avec
M5.

---

## 3 quater. M5 — la preuve du chiffre (2026-08-31)

`AreaSizingResult` porte désormais la trace de la recherche : `attempts` (par
candidat vérifié : le gap promis par la cellule sonde, le gap mesuré sur la
grille, le verdict), `probeRejected` et `ladderSize`. `AreaSizingEvidence` la
rend sous `Why this recommendation?`, à la suite de la répartition des cellules.

Vérifié à l'écran, aire de 12 cellules, exigence 2 h :

```
SEARCH EVIDENCE
60 configurations on the ladder · 46 ruled out by the least-covered cell alone
· 1 verified over every cell
36 payloads · 12 × 3    probe 1 h 26 min · area 1 h 53 min · verified
```

Deux choses que cette ligne rend vérifiables et qui n'étaient qu'affirmées :
l'écart entre ce que promet la sonde et ce que donne la grille (1 h 26 → 1 h 53),
et le fait que la recherche a bien eu lieu — 46 configurations écartées sans
dépenser une passe de grille. `probeRejected`, jusque-là calculé et invisible,
est enfin lu.

Le déclencheur annonce son coût : `Size this area · 12 cells · about 5 s`.
L'estimation est calibrée sur les mesures du §3 ter (sonde ~3 s, ~18 ms par
cellule et par vérification, deux à trois vérifications), arrondie à cinq
secondes et libellée « about » — elle existe pour que l'attente soit consentie,
pas pour être chronométrée.

---

## 3 quinquies. M1 — sortie anticipée (2026-08-31)

Implémentée, mais **pas sous la forme prévue par le plan**, et l'écart est le
point important.

Le plan proposait `stopWhen` sur `analyseArea` plus un champ `truncated` que
tous les consommateurs devaient refuser. C'est une invariante à police
humaine : chaque futur lecteur de `AreaAnalysis` doit se souvenir de tester le
drapeau, et rien ne l'y force. À la place, `verifyAreaMeets` rend une **union** :

```ts
type AreaVerification =
    | { met: true; analysis: AreaAnalysis }
    | { met: false; failedCell: AreaCellResult; cellsComputed: number; totalCells: number };
```

Une grille tronquée n'a ni pire cellule, ni moyenne, ni distribution : elle
**n'est pas représentable** comme une `AreaAnalysis`. La heat map et les KPI ne
peuvent donc pas la recevoir — le type refuse, personne n'a à se souvenir.
`analyseArea` garde son contrat, inchangé et non tronquable.

**Mesures, mêmes cas qu'au §3 ter :**

| grille | exigence | avant | après | cellules |
|---|---|---|---|---|
| 96 cellules | 2 h | 8,6 s | **6,4 s** | 156/288 — 46 % économisés |
| 96 cellules | 1 h | 10,4 s | **9,4 s** | 156/192 — 19 % |
| 216 cellules | 2 h | 11,3 s | **8,0 s** | 228/432 — 47 % |

Conforme à la prévision du §3 ter, y compris le cas défavorable à 1 h où les
échecs surviennent tard dans la grille.

La granularité est le **lot** de 12 cellules, pas la cellule : s'arrêter plus
finement voudrait dire renoncer à la passe de propagation partagée qui rend le
lot économique. C'est le même arbitrage vu des deux côtés.

Effet de bord utile pour M5 : la trace nomme désormais l'endroit de l'échec —
`fails at cell 12/96` — ce qui rend visible le fait que le verdict a été atteint
sans mesurer le reste.

## 3 sexies. Ergonomie de l'état « non dimensionné » (2026-08-31)

L'état initial d'une zone affichait trois éléments qui disaient la même chose :
un badge `ASSESSMENT REQUIRED`, la phrase « No payload count has been measured
for this area yet. », puis le bouton `Size this area`. Le badge annonçait une
impasse là où l'outil savait répondre, et la phrase répétait l'évidence que le
bouton portait déjà.

**Retenu : un seul élément.** Dans l'emplacement du verdict, juste sous la
question, un bouton unique — `MEASURE THE PAYLOADS NEEDED · 9 cells · about 5 s`.
Le libellé nomme la réponse, pas la machinerie. Pas de badge : rien n'a été
mesuré, donc il n'y a pas de verdict à afficher, et un emplacement vide est ici
plus honnête qu'un verdict inventé. Pendant la recherche, même règle : la ligne
de progression est le seul contenu, le badge `Sizing…` disparaît.

**Conséquence obligatoire : distinguer « jamais demandé » de « cherché sans
résultat ».** Les deux tombaient sur `AREA_NOT_SIZED`. Une recherche terminée
sans candidat aurait alors réaffiché le bouton comme si rien ne s'était passé.
`customerSizing.ts` produit désormais `AREA_NOT_FOUND` (avec `stoppedAtCeiling`
et `ruledOutByProbe`) : celui-là garde son badge `Assessment required`, énonce
l'absence mesurée, et n'offre pas de relance — la recherche a eu lieu, et le
bloc `Search evidence` en dessous dit jusqu'où elle est allée.

**Le document suit.** `customerVerdict` gagne le terme `NOT SIZED`, employé par
la fiche zone quand l'exigence n'est pas couverte, pour que l'écran et le PDF ne
divergent pas sur ce que l'outil prétend savoir.

Vérifié dans le navigateur (1440×900 et 375×812) sur les trois états :
non dimensionné, en cours, vérifié (36 charges utiles, 12 × 3), plus
`AREA_NOT_FOUND` à 30 min d'exigence (60 configurations, 60 écartées par la
cellule sonde).

## 4. Tests

Unitaires, sur le moteur :

1. sortie anticipée — une zone dont la 2ᵉ cellule échoue n'exécute pas les 94
   suivantes (compteur d'appels), et l'analyse rendue porte `truncated: true` ;
2. une analyse tronquée est refusée par les consommateurs de heat map et de KPI ;
3. la sonde rend l'échelle classée du moins cher au plus cher ;
4. un candidat qui passe sur la pire cellule d'origine mais échoue ailleurs fait
   monter d'un cran — le cas qui justifie la vérification, à construire en fixture ;
5. l'ordre des répartitions à compte égal est respecté avant de monter ;
6. le résultat vérifié porte le gap le pire **sur la zone**, pas celui de la sonde.

Contrat d'interface :

7. `AREA_SIZING` affiche une progression et pas de chiffre ;
8. `AREA_VERIFIED` affiche le compte, la répartition et le libellé « vérifiée sur
   l'ensemble des cellules » — jamais « optimale » ;
9. l'annulation au changement d'exigence laisse la carte dans `AREA_NOT_SIZED`,
   pas dans un état de calcul figé.

---

## 5. Risques

- **Le pire cas reste le pire cas.** Si aucun candidat ne passe, on aura payé
  60 + k × cellules pour un `BEYOND_RANGE`. Borner k (par exemple 6 candidats) et
  le dire dans le résultat.
- **La sonde peut mal choisir.** Sur une zone très hétérogène, la pire cellule
  d'origine n'est pas représentative et k grimpe. La sortie anticipée limite la
  facture, pas le nombre d'itérations.
- **Grille trop grossière.** `validateArea` refuse déjà une grille plus grossière
  que la fauchée ; le dimensionnement hérite de cette garantie et ne doit pas la
  contourner pour aller plus vite.

---

## 6. Ordre d'exécution et estimation

L'ordre compte : **A et B avant M1**. Ce sont des optimisations à résultat
identique, vérifiables par comparaison bit à bit avec l'implémentation
actuelle — donc à faire tant que cette référence existe encore. Une fois M1
introduit (analyses tronquées) la comparaison devient plus délicate à écrire.

Elles réduisent aussi ce que M1–M5 doit rendre acceptable : avec A + B une
vérification de zone tombe à ~1,2 s, ce qui change la nature du produit — le
dimensionnement d'une zone de 96 cellules passe sous la dizaine de secondes, et
la question du déclenchement manuel (M4) mérite d'être reposée à ce moment-là
plutôt que tranchée maintenant.

| lot | contenu | estimation |
|---|---|---|
| A | cache ECI cible par pas + test d'égalité | 2 h |
| B | cellules groupées sur le chemin multi-cibles + bornes mémoire | 3 h |
| M1 + M2 | sortie anticipée, protocole worker, progression, annulation | 1/2 journée |
| M3 + M4 + M5 | états, déclenchement, restitution | 1/2 journée |

Rien ici ne touche au propagateur ni à la géométrie : A est une mémoïsation, B
emprunte un chemin déjà écrit et testé.
