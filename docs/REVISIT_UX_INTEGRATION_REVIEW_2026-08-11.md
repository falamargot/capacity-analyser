# Revue du plan « Intégration UX/UI de REVISIT »

**Date :** 2026-08-11
**Statut :** **validée sur le fond** le 2026-08-11, sous réserve de trois ajustements (comptage d'état, cadrage `requestRenderMode`, contrat de snapshot) — tous appliqués dans cette version. Base du plan révisé ; voir `IMPLEMENTATION_PLAN.md`. Aucune ligne de code produite à ce stade.
**Objet :** réponse à la proposition d'évolution en 8 phases / 4 lots
**Objectif retenu :** cohérence UIX (visuelle et parcours client) sur ENG, COMM et REVISIT, **sans régression fonctionnelle dans aucun des trois modes**

---

## 1. Ce que la proposition établit correctement

Les trois diagnostics de fond ont été vérifiés dans le code, pas seulement lus :

| Constat de la proposition | Vérification |
|---|---|
| L'état ENG/COMM est perdu à l'entrée dans REVISIT | Confirmé. Aucune persistance dans tout le code applicatif (`0` occurrence de `localStorage`/`sessionStorage` dans `src/App.tsx`), et `RootShell.tsx` démonte `<App/>` intégralement. **80 déclarations `useState`/`useRef`** (54 + 26) disparaissent à chaque bascule. |
| REVISIT n'est pas responsive | Confirmé et total. Aucun `@media`, `matchMedia` ni breakpoint Tailwind dans les 63 fichiers / ~13 900 lignes de `src/features/revisit/`. |
| COMM affiche un verdict d'échec avant évaluation | Confirmé. `CommercialKpiBar.tsx:49` dérive `'No Service Available'` de `technology === 'not_available'` : l'absence de donnée est présentée comme un résultat négatif. Aucun état `NOT_CONFIGURED` n'existe dans le code. |

Le découpage en phases, la table d'inventaire d'état (§1.1) et la matrice E2E (§7.3) sont de bonne qualité et méritent d'être conservés tels quels. La critique qui suit porte sur **l'ordre et le périmètre**, pas sur la lucidité de l'analyse.

---

## 2. Désaccord central : le plan met le risque de régression en premier

L'objectif est *la cohérence UIX sans régression fonctionnelle*. Or la Phase 1 — extraire un `TelecomSessionState` de `App.tsx` — est simultanément :

- **l'élément le plus risqué** pour la non-régression fonctionnelle : 6 698 lignes, 80 déclarations d'état, tous les consommateurs à recâbler ;
- **l'élément le moins UIX** : l'utilisateur ne voit rien de nouveau à l'écran quand elle est terminée ;
- **budgété 4–6 jours**, ce qui est irréaliste d'un facteur 3 à 4 ;
- **placé en tête**, derrière un gate qui bloque tout le reste.

Autrement dit, le plan fait dépendre 100 % des gains visibles de l'opération qui a le plus de chances de casser ENG ou COMM. C'est l'inverse de ce que l'objectif demande.

### Contre-proposition sur ce point précis

Remplacer l'extraction d'un provider par un **snapshot sérialisé du scénario**, capturé au démontage et réhydraté au remontage (store module-level ou `sessionStorage`).

| | Extraction `AppSessionProvider` | Snapshot / réhydratation |
|---|---|---|
| Inventaire d'état à faire | Oui | Oui (identique) |
| Restructuration de `App.tsx` | Totale | Aucune |
| Comportement si un champ manque | Rupture | Valeur par défaut |
| Réversibilité | Refactor inverse | Suppression de l'adaptateur de capture/réhydratation |
| Valeur utilisateur obtenue | 100 % | ~90 % |

La valeur perçue — « je retrouve mon scénario » — est la même. Le risque de régression ne l'est pas. L'extraction complète reste possible plus tard, une fois que le filet de tests existe et qu'on sait précisément quel état compte.

### Le snapshot n'est pas un dump

La réversibilité annoncée ci-dessus ne tient que si le snapshot est traité comme un **contrat**, pas comme une sérialisation opportuniste de l'état du composant. Quatre propriétés non négociables :

- **Schéma explicite.** Un type nommé, écrit à la main, dont chaque champ a été retenu délibérément. Jamais un `JSON.stringify` de l'état courant.
- **Versionné.** Un `schemaVersion` porté par la charge utile. Un snapshot d'une version antérieure est lisible ou ignoré proprement, jamais appliqué partiellement.
- **Sélectif.** Uniquement le scénario métier et la navigation métier. Rien de recalculable, aucun objet Cesium, aucune référence DOM, aucun worker, aucun timer — la table §1.1 de la proposition donne déjà le bon découpage.
- **Tolérant aux champs absents.** Toute clé manquante retombe sur la valeur par défaut du mode. C'est cette propriété qui rend le rollback sûr et qui permet de faire évoluer le schéma sans migration de données.

Sous ces conditions, désactiver la persistance revient à retirer l'adaptateur de capture/réhydratation : le reste de `App.tsx` n'a pas connaissance du mécanisme.

---

## 3. Un flou à lever : « isolation de REVISIT » désigne trois choses

Le plan touche à l'ADR-001 §4 sans le nommer. Il faut séparer :

**a) Isolation de dépendances** — `src/features/revisit/` n'importe aucun domaine telecom. Mesuré : les seules dépendances sortantes sont `wgs84Geometry`, `sphericalGeometry`, `earthGeometry`, `observedOrbitalElements` et `SimulationClockContext`. En entrant : `RootShell` et des tests, rien d'autre.
→ **À conserver.** Elle ne coûte rien, et le bon pattern de partage est déjà établi ailleurs : `oneWebCombCore.ts` a été extrait exactement pour que le moteur REVISIT réutilise cette maths sans tirer le fichier lié à `satellite.js`. La réponse au besoin de partage est l'extraction d'un cœur pur, pas le croisement des modules.

**b) Isolation runtime** — `<App/>` démonté, un seul viewer Cesium, REVISIT hors de `SimulationProvider`.
→ **À conserver.** L'ADR §4 en chiffre le motif : `App.tsx` se re-rend au moins 2×/seconde indéfiniment (audit du 2026-07-28) et tout ce qui est monté dedans en hérite. La contrainte « deux viewers Cesium ne coexistent jamais » a un précédent concret dans ce dépôt (fuite de 109 MB du mesh-cache). L'arborescence proposée en §1.3 respecte déjà cette propriété — c'est un bon point du plan.

**c) « Isolation d'état »** — le scénario ENG/COMM détruit.
→ **Ce n'est pas une décision d'architecture**, c'est un effet de bord de (b). L'ADR ne l'argumente nulle part ; il recommande même l'inverse dans ses *Consequences to watch* : hisser le cache de données satellites vers le root shell pour que le retour dans ENG ne refasse pas les requêtes. Hisser le scénario a exactement la même forme.

**Conséquence pratique : préserver l'état ENG/COMM suit l'ADR-001, elle ne l'amende pas.** Aucune décision n'a besoin d'être rouverte pour l'objectif principal du plan.

### La règle manquante

Ce qui violerait réellement l'ADR, c'est le couplage **bidirectionnel** : que REVISIT puisse *lire* la session telecom. Le store hissé doit donc être écrit et lu par le seul runtime telecom, et **inatteignable depuis `src/features/revisit/`** — garanti par une règle `no-restricted-imports` ou un test, pas par convention. Sans ce garde-fou, `AppSessionProvider` devient en six mois le point d'entrée par lequel la frontière disparaît sans que personne ne l'ait décidé.

---

## 4. Re-séquencement proposé

L'ordre suivant délivre les gains UIX d'abord et concentre le risque fonctionnel à la fin, quand le filet de tests existe.

### Lot A — Parcours et navigation (visible, risque quasi nul)

Aucun de ces items ne touche `App.tsx` en profondeur.

- **Libellé de retour explicite** (§2.3). `originRef` existe déjà dans `useAppModeState.ts` et mémorise correctement le mode d'origine — il ne manque que le texte « Retour à Engineering / Commercial ». *Quelques heures.*
- **Sélecteur global ENG | COMM | REVISIT** accessible depuis les trois modes (§2.1), y compris REVISIT → COMM en direct.
- **Synchronisation URL et historique** (§2.4). Aujourd'hui `?mode=` est lu à l'initialisation et jamais réécrit ; l'application n'a pas de routeur. C'est aussi la réponse à une des questions ouvertes de `HANDOFF.md`.
- **Message de première entrée dans REVISIT** (§2.2), discret et mémorisé.

### Lot B — Cohérence visuelle et sémantique (visible, risque contenu)

- **Coquille de présentation partagée**, élargie par rapport au `GlobalAppHeader` du plan : tokens de thème, header, drawer, bottom sheet, primitives de layout. C'est la meilleure idée du plan et elle mérite plus que le header seul, parce que le coût réel de l'isolation runtime est la duplication de coquille UI — REVISIT n'hérite d'aucun travail responsive fait côté ENG.
- **`EvaluationState` commun** (§4.4) et suppression des verdicts prématurés COMM (§4.3). C'est un **bug de confiance**, indépendant de tout le reste, et il est cohérent avec les constats de l'audit de cohérence de champs du 2026-07-21.
- **Thème** (§2.5) : viser l'option recommandée (tokens partagés), l'identité ambre de REVISIT restant un choix d'accent et non un thème figé.

### Lot C — Responsive et accessibilité (visible, indépendant du reste)

Les Phases 3 et 5 telles qu'écrites, sans modification. Elles ne dépendent **pas** de la persistance d'état — les faire attendre le Lot A du plan initial est un choix inutilement coûteux. À faire après le Lot B pour réutiliser la coquille partagée plutôt que de la dupliquer.

### Lot D — Persistance d'état et performance (invisible, risqué)

- Snapshot / réhydratation du scénario (§3 ci-dessus), avec la règle d'import unidirectionnelle.
- Snapshot caméra (§1.4), politique d'annulation des calculs en vol (§1.5).
- Instrumentation et budgets (Phase 6).

---

## 5. Deux prérequis non budgétés dans le plan

**a) L'outillage E2E et visuel n'est pas opérationnel.** Le dépôt exécute `vitest` (184 fichiers de test). Le lockfile référence indirectement `@vitest/browser-playwright`, mais il n'existe **aucun harness E2E, aucun script, aucune configuration ni aucune baseline visuelle** — la dépendance transitive ne constitue pas un point de départ exploitable. La matrice E2E de la §7.3 plus les captures de référence sur 7 viewports × 2 thèmes est **un lot d'outillage à part entière**, pas un sous-ensemble de 5–7 jours. Deux issues acceptables :
- l'ajouter explicitement comme prérequis chiffré ;
- ou renoncer aux tests visuels et s'appuyer sur des assertions DOM + une checklist manuelle documentée.

Ce qui n'est pas acceptable, c'est de garder le gate « pas de modification d'architecture avant automatisation des références » sans financer l'outil qui le rend atteignable — le chantier ne démarrerait jamais.

**b) La baseline doit être mesurée sur `requestRenderMode` stabilisé.** `requestRenderMode` est **déjà activé dans les trois modes** — ENG, COMM et REVISIT. Ce n'est donc pas un chantier concurrent, et il n'y a pas de collision à arbitrer : c'est l'état de référence. Conséquence directe sur la Phase 0 — toutes les mesures de FPS, de CPU au repos et de durée de transition doivent être prises sur cet état activé, et les budgets de la Phase 6 exprimés par rapport à lui. Une baseline capturée avec un rendu continu produirait des seuils sans rapport avec l'application réelle, et transformerait la première mesure post-changement en fausse régression.

---

## 6. Ajustements sur les gates et les budgets

- **« Workers orphelins = 0 » ne discrimine rien** : chaque hook REVISIT (`useAreaAnalysis`, `useRevisitSweep`, `useRevisitAnalysis`) appelle déjà `terminate()` en cleanup. Le budget passerait dès le premier jour. Le risque réel est le **contexte WebGL / viewer Cesium**, pas les workers — c'est ce qu'il faut compter.
- **Mémoire après 20 cycles** : l'instrumentation existe déjà (monitor dev, `window.__memStats`, HUD Ctrl+Shift+M). La référencer plutôt qu'en construire une nouvelle.
- **Horloge unique** : `SimulationClockProvider` enveloppe délibérément les deux runtimes — il ne doit jamais exister deux autorités de temps. C'est un invariant à tester explicitement dans la matrice ; il n'y figure pas.
- **Tolérances numériques** : la *Definition of Done* exige que les résultats restent « dans les tolérances » sans jamais les définir. C'est précisément le piège documenté par le cross-check GMAT (R4) : un oracle qui partage les constantes du moteur ne prouve pas ce qu'il semble prouver. Chaque tolérance ajoutée doit répondre à la question « ce test échouerait-il si la constante testée était fausse ? ».

---

## 7. Definition of Done reformulée

La DoD du plan mélange objectifs UIX et objectifs de refactoring. Réalignée sur l'objectif réel :

**Non-régression fonctionnelle (bloquant, les trois modes)**
- Les résultats numériques ENG, COMM et REVISIT sont inchangés, comparés par des tests indépendants de l'UI, avec tolérances justifiées.
- Un seul viewer Cesium et une seule autorité de temps actifs à tout instant.
- Aucune croissance mémoire continue après 20 bascules.

**Cohérence du parcours (l'objectif)**
- Depuis chacun des trois modes, les deux autres sont atteignables directement.
- Le retour depuis REVISIT est nommé et ramène au mode d'origine.
- L'historique navigateur fonctionne ; une URL directe est réparable.
- Le scénario ENG/COMM survit à un aller-retour REVISIT.

**Cohérence visuelle**
- Thème et navigation homogènes sur les trois modes.
- REVISIT utilisable de 390 à 1920 px sans débordement.
- Aucun état incomplet présenté comme un échec.
- Audit d'accessibilité sans problème critique ou sérieux.

---

## 8. Estimation

| Lot | Estimation | Risque de régression |
|---|---|---|
| A — Parcours et navigation | 3–5 j | Très faible |
| B — Coquille partagée, thème, `EvaluationState` | 1,5–2 sem. | Faible |
| C — Responsive et accessibilité | 1,5–2 sem. | Faible |
| Prérequis outillage E2E/visuel | 1–2 sem. | — |
| D — Snapshot d'état, caméra, perf | 1,5–2 sem. | Moyen |
| *(option)* Extraction complète `AppSessionProvider` | *+3–4 sem.* | *Élevé* |

**4 à 6 semaines pour une personne** sur la version pragmatique — contre 5–8 annoncées, mais 10–14 pour le plan tel qu'écrit, extraction complète comprise.

Le point le plus important n'est pas le total : c'est que **la moitié de la valeur UIX est livrable en une semaine** (Lot A + verdicts COMM), sans toucher à l'architecture, et que rien dans le plan ne justifie de la faire attendre.

---

## 9. Résumé en une page

1. Le diagnostic est juste sur les trois points qui comptent, vérifié dans le code.
2. Le plan place l'opération la plus risquée pour la non-régression en tête, alors qu'elle est la moins visible pour l'utilisateur. Inverser.
3. Remplacer l'extraction du provider par un snapshot sérialisé — schéma explicite, versionné, sélectif, tolérant aux champs absents : même valeur perçue, risque et réversibilité sans commune mesure.
4. « L'isolation de REVISIT » recouvre trois choses ; deux sont à garder, la troisième n'a jamais été une décision. Préserver l'état ENG/COMM **suit** l'ADR-001 au lieu de la contredire.
5. Ajouter la règle d'import unidirectionnelle, absente du plan et seul vrai garde-fou de la frontière.
6. Budgéter l'outillage E2E/visuel, ou renoncer explicitement aux tests visuels : le gate de sortie de la Phase 0 est sinon inatteignable. Une dépendance transitive au lockfile n'est pas un harness.
7. Mesurer la baseline sur `requestRenderMode` activé — l'état réel des trois modes — sinon les budgets de la Phase 6 fabriqueront de fausses régressions.
8. Définir les tolérances numériques avec la contrainte « ce test peut-il échouer ? » — leçon R4/GMAT.
