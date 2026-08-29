# REVISIT — sémantique du sélecteur de modèle, et préalables à une flotte réelle

**Date :** 2026-08-29
**Statut :** D1, D2 et D5 appliquées et vérifiées ; D3–D4 en attente de validation métier
**Contexte :** revue du triptyque `OneWeb / Measured / Custom` et de la proposition
d'intégrer la flotte ENG (TLE réels + SGP4) dans REVISIT.

---

## 1. Le défaut de contrat : trois objets de nature différente au même rang

Le sélecteur `AdvancedDrawer.tsx` (`MODE_OPTIONS`) présente trois boutons au même
niveau, comme s'il s'agissait de trois constellations comparables. Ce n'est pas ce
qu'ils sont :

| Choix | Ce que l'utilisateur peut croire | Ce qui est calculé |
|---|---|---|
| `OneWeb` | la constellation OneWeb | modèle HLD paramétrique : 576 slots actifs + 58 spares, dont la répartition est une hypothèse assumée (`referenceProfiles.ts`) |
| `Measured` | la vraie flotte actuelle | un **nouveau Walker idéal** ajusté sur une partie des TLE (P × S synthétiques, sans ladder, sans seam, sans spares) |
| `Custom` | une troisième constellation | un **état d'édition**, initialement identique au HLD (le badge `= HLD` le dit) |

Soit : une **source de référence**, une **méthode de calibration**, une **action
d'édition**. Le risque n'est pas physique — le moteur est correct — il est
sémantique, et il porte devant un public non technique.

Deux libellés aggravaient la confusion et ont été corrigés (§5) :

- `Measured from live fleet` — faux au sens strict : la ladder de `fetchTLE`
  (cache frais → API live → cache périmé → fichier embarqué) peut servir des
  données anciennes ou embarquées, et c'est le cas nominal hors réseau ouvert.
- `Validated model` — mélangeait la validation du **propagateur** (réelle :
  GMAT, SGP4) et l'autorité des **données** HLD (partiellement hypothétique).

## 2. Pourquoi la flotte ENG ne se branche pas telle quelle

L'ADR-001 §1 prévoit explicitement ce chemin (propagateur d'éphémérides derrière
`propagate(elements, t)`). Les obstacles ne sont pas là où on les attendait.

**Obstacle réel n°1 — l'affectation des payloads.** « Flotte réelle, tous les
satellites porteurs » calcule la revisite de ~645 satellites tous équipés : un
plafond théorique, non comparable à un scénario HLD à 12, 24 ou 36 payloads. La
sélection manuelle au clic n'est ni reproductible ni un dimensionnement. Deux
contrats seulement sont honnêtes :

1. **payloads réels** — on dispose de la liste des NORAD IDs équipés ;
2. **payloads hypothétiques** — une règle **déterministe et traçable** affecte N
   satellites réels, p. ex. appariement des slots Walker aux TLE les plus proches.

Sans l'un des deux, le chiffre produit ne répond à aucune question posée.

**Obstacle réel n°2 — le sweep reste nécessairement paramétrique.** `payloadSweep`
répond « il vous faut N payloads » en balayant les topologies ; une flotte réelle
n'en a qu'une. La flotte ENG peut s'ajouter au moteur, jamais le remplacer.

**Obstacle réel n°3 — reproductibilité.** Le jeu TLE tourne toutes les 30 min. Un
mode observationnel doit enregistrer, sans exception : source réelle (live /
cache / fichier embarqué), date de récupération et plage d'époques TLE, empreinte
du jeu, NORAD IDs inclus **et exclus avec motif**, règle d'affectation des N
payloads, et l'avertissement que le résultat dépend de ce snapshot.

**Obstacle réel n°4 — la grammaire `x, y, z`.** `subConstellation.ts` exige que x
divise P et y divise S. La flotte réelle a des plans à populations inégales : les
diviseurs cessent d'être exacts.

**Nuance de vocabulaire.** ENG ne charge pas « la flotte opérationnelle » mais un
**catalogue TLE OneWeb non décayé** : `buildSatelliteData` n'écarte que les objets
marqués `decayed`, et quand SATCAT est indisponible **tout est réputé
`operational`** (`satelliteService.ts:503`). Ne jamais présenter ENG comme la
vérité opérationnelle.

## 3. Ce qui n'était PAS un obstacle : le coût de SGP4 — mesuré

L'estimation « SGP4 coûte 1 à 3 ordres de grandeur de plus que Kepler+J2 » était
avancée sans mesure. **Elle est fausse.** Le banc est reproductible :

```
npm run bench:propagators
```

`scripts/bench-propagators.ts` — 651 satrecs OneWeb lus dans
`public/celestrak.txt`, fenêtre REVISIT par défaut (72 h @ 10 s = 25 920 pas,
16,9 M évaluations flotte entière), `satellite.js` contre le vrai
`keplerJ2.propagateState`.

Quatre exécutions, machine de développement, Node 24 :

| Propagateur | µs / évaluation | Flotte 651 sats × 72 h @ 10 s |
|---|---|---|
| SGP4 (`satellite.js`) | 0,233 – 0,239 | **3,9 – 4,0 s** |
| Kepler + J2 | 0,026 – 0,040 | 0,43 – 0,68 s |

**Le chiffre porteur est l'absolu SGP4 : ~4 s mono-thread pour la flotte
entière sur la fenêtre complète**, stable à ±3 % d'une exécution à l'autre. Le
ratio, lui, varie de **6× à 9×** parce que c'est le côté Kepler qui bouge (deux
sinus/cosinus par pas, sensible au JIT et au cache) ; le citer comme une
constante serait reproduire l'erreur qu'on corrige. Dans tous les cas : **moins
d'un ordre de grandeur**, et non trois.

Conséquence architecturale : la précalculation d'éphémérides n'est **pas** un
prérequis. Le coût n'est pas l'argument contre le mode observationnel ; le
contrat métier l'est.

## 4. Les trois questions à faire trancher par les auteurs du brief

Le besoin documenté (`REVISIT_SIMULATOR_DESIGN.md`) est un **dimensionnement**
— démontrer l'effet de X payloads hébergés sur une constellation de référence —
et non l'évaluation d'une liste de satellites réellement équipés. À confirmer
explicitement, avec :

1. **Quelle flotte de référence ?** 576 slots actifs, 634 objets HLD, ou tous les
   TLE non décayés ?
2. **Les payloads sont-ils répartis par topologie, ou associés à des satellites
   nommés ?**
3. **Le livrable est-il un dimensionnement reproductible, ou un état de flotte
   daté ?**

Tant que 2 n'est pas tranchée, le mode observationnel n'a pas de spécification.

## 5. Décisions appliquées

- **D1 — libellés honnêtes.** `revisitTheme.modelBadge` :
  `Measured from live fleet` → `Fitted to latest TLE set` (puis retiré avec le
  mode, cf. D2) ; `Validated model` → `HLD reference profile`, parce qu'il
  confondait validation du propagateur et autorité des données.
  `e2e/revisit-p0.spec.ts` suit.
- **D2 — le fit devient un diagnostic pur.** `ReferenceMode` n'a plus que deux
  valeurs, `'HLD' | 'CUSTOM'` : le sélecteur porte `OneWeb Gen1 · HLD` et
  `Edit a copy`, et l'ajustement TLE est descendu en action secondaire
  `Compare with available TLE data` — « available », pas « live » ni
  « latest » : la ladder de `fetchTLE` peut servir un cache périmé ou le fichier
  embarqué, et sur réseau filtré elle le fait toujours. **Elle n'appelle plus
  `applyReference`** — la constellation analysée ne change pas — et le résidu
  s'affiche dans un bloc distinct de `ModelProvenance` intitulé `TLE shell
  characterisation · not the analysed model` : le résidu est mesuré contre le
  **meilleur Walker ajusté**, pas contre le HLD, et l'appeler « drift » laissait
  entendre le contraire. Le bloc porte désormais la topologie ajustée et ses
  écarts au HLD (`Fitted shell 12 × 53 · 1198,9 km · 87,88° / vs HLD 12 × 48 ·
  1200 km → +5 sats/plan, +60 total, −1,1 km`), sans quoi `645 real satellites`,
  `248 km RMS` et un bloc Characteristics à `12 × 48` ne se lisaient pas
  ensemble. En mode CUSTOM il porte en plus `Independent of your custom
  parameters` : la mesure caractérise le catalogue, pas les nombres saisis. `readinessSignals` ne déclare plus de dépendance réseau : aucun mode
  d'analyse n'en a.
  Conséquence assumée : on ne peut plus faire tourner l'analyse sur la coquille
  ajustée. C'était précisément l'affordance qui la faisait passer pour une
  troisième constellation comparable.
  Régression épinglée : `RevisitP0Ui.test.tsx` — « shows the TLE fit as a
  diagnostic beside the analysed model, not as one ».
- **D5 — le coût SGP4 est mesuré**, pas estimé (§3).

**Vérifié en navigateur** (dev :3000, 2026-08-29) : le badge reste
`HLD REFERENCE PROFILE`, `Characteristics` reste `12 planes × 48 satellites`
après l'action, et le diagnostic s'affiche sous
`FLEET DRIFT CHECK · NOT THE ANALYSED MODEL` : *248 km RMS along-track ·
645 real satellites · 12 planes · RAAN 0,03° · in-plane 1,88° · altitude
13,9 km RMS*, avec ses 5 caveats. Le contraste avec les 576 slots du HLD est
maintenant lisible comme une mesure, non comme une variante.

## 5 bis. La mesure passe sur sa propre surface (D6, 2026-08-29)

Le bloc inline restait un défaut d'UX même corrigé : il occupait un tiers d'un
panneau de **réglages** avec quelque chose qui n'en est pas un, et surtout
**il pouvait s'ouvrir sans jamais se refermer** — `useOneWebCalibration.reset()`
existait mais n'était câblé à aucun bouton, et `Reset scenario` ne le touchait
pas. Une action qui ajoute de l'information sans action symétrique pour la
retirer est un piège en démonstration.

`TleComparisonDialog` : popup ancré au bouton au-dessus de `md`, **feuille
plein écran en dessous** (le contenu fait une douzaine de chiffres plus une
liste de caveats ; un popup de 420 px sur un téléphone de 375 px est une feuille
avec des étapes en plus). Ouverture immédiate au clic avec `Measuring…` à
l'intérieur — la mesure peut prendre 5 s et un bouton sans retour visible se
fait recliquer. Fermeture Échap / clic sur le fond / croix / bouton `Close`,
focus rendu au lanceur. `Re-measure` est **dans** le dialogue : c'est là que le
second clic a un sens.

Rejeté : l'affichage tant que le bouton est maintenu. Le contenu n'est pas
lisible d'un coup d'œil et les caveats ne se déplient pas sans relâcher ; on ne
peut ni copier ni citer ; le délai réseau casse le geste ; et surtout un maintien
n'a **pas d'équivalent clavier**, et l'appui long au tactile est déjà pris par le
menu système. Une information réservée à la souris maintenue est une information
que certains utilisateurs ne peuvent pas obtenir.

**Provenance affichée, et non déductible autrement.** `satelliteService` publie
désormais le barreau de la ladder qui a réellement servi (`live` / `cache-fresh`
/ `cache-stale` / `bundled`) et l'instant du fetch ; le hook y ajoute la plage
d'époques TLE et la taille du catalogue avant filtrage. Le dialogue les affiche
et dit explicitement qu'une nouvelle mesure peut différer.

Cela a immédiatement produit un fait qu'aucun écran ne montrait : en
environnement de développement, CelesTrak est injoignable, la source est le
**fichier embarqué**, et ses époques TLE datent du **23–24 mars 2026** — cinq
mois. Les 248 km RMS étaient donc mesurés sur un catalogue périmé sans que rien
ne le dise. `npm run update-celestrak` rafraîchit le fichier.

`ModelProvenance` ne porte plus que les affirmations sur le modèle analysé.

**Correction D6.1 — non modal.** Le premier jet était une modale : elle assombrit
et floute le panneau que le lecteur doit justement avoir sous les yeux. `12 × 53`
n'a de sens que si `12 × 48` est lisible au même instant ; une modale transforme
la comparaison en exercice de mémoire. C'est donc un **panneau latéral non modal**
accroché au bord droit de `Constellation settings` (à gauche si le bord droit
déborde, feuille plein écran s'il ne reste de place ni d'un côté ni de l'autre,
et sous `md`) : pas de fond assombri, pas de piège à focus, pas de vol de focus,
`pointer-events` rendus à tout ce qu'il ne couvre pas.

Le panneau de réglages **reste ouvert quoi qu'il arrive** — y compris au clic
dans le panneau latéral. Cela se paie d'une ligne dans `RevisitHeader` :
`useClickOutside` ferme le panneau à tout pointeur hors de son sous-arbre, et le
panneau latéral est portalé hors de celui-ci ; il se marque
`data-revisit-panel-flyout`, que ce gestionnaire traite comme intérieur.

Le bouton est un **interrupteur** (`Compare with available TLE data` ↔
`Hide TLE comparison`, `aria-expanded`) et ne relance **pas** la mesure au
repli/dépli : seul `Re-measure`, dans le panneau, refait un appel réseau.

Vérifié en navigateur : repli puis dépli conservent l'horodatage
`2026-08-29 09:54 UTC` sans repasser par `Measuring…`, le clic dans le panneau
latéral ne ferme pas les réglages, forme `flyout` à 1280 px et `sheet` à 375 px.

## 6. Décisions en attente

- **D3 — MEASURED n'est pas redondant avec SGP4** et ne doit pas être supprimé :
  le fit répond « la flotte ressemble-t-elle encore au modèle Walker ? », SGP4
  répondrait « quelle revisite produisent ces satellites pendant cette
  fenêtre ? ». Deux questions, deux surfaces, jamais deux configurations
  interchangeables.
- **D4 — mode observationnel** : à développer uniquement après validation de §4,
  et comme espace séparé (`Benchmark orbital observé — jeu TLE daté`) portant
  toute la provenance de §2 obstacle 3.
