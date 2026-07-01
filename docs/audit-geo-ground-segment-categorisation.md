# Audit — Catégorisation de l'infrastructure sol GEO (SCC / TT&C / Monitoring / Teleport)

> Audit en lecture seule. Aucun fichier modifié. Objectif : cartographier l'état actuel avant toute refonte.

## Constat central

`GEO_GATEWAYS` (src/components/globe/GlobeConfig.ts:71) est un tableau plat de 10 sites. Chaque entrée a déjà
un champ `role: string` libre, avec ces valeurs réellement présentes aujourd'hui :

| teleportCode | name | role |
|---|---|---|
| RAM | Rambouillet | `Global_SCC_Nominal` |
| CAG | Cagliari | `EMEA_SCC_Backup` |
| TUR | Turin | `EMEA_SCC_Backup` |
| MEX | Mexico City | `AMERICAS_SCC_Nominal` |
| HER | Hermosillo | `AMERICAS_SCC_Backup` |
| MAR | Martinique | `Relay_Monitoring` |
| DUB | Dubai | `CSC_Monitoring` |
| SIN | Singapore | `CSC_Monitoring` |
| IBA | Ibaraki | `TTC_Monitoring` |
| PER | Perth | `TTC_Monitoring` |

**Aucun site n'a un rôle "Teleport".** Pourtant le code et l'UI désignent systématiquement ces 10 sites comme des
"Gateway" / "Teleport" (cf. §3) et leur appliquent des calculs de link budget commercial RF complets (cf. §2).
Le champ `role` existe mais n'est **jamais utilisé pour piloter le comportement** (filtrage, exclusion des calculs
RF, etc.) — il est uniquement consommé pour de l'affichage texte (`role.replaceAll('_',' ')`,
`role.includes('Monitoring')`, `role.includes('Backup')`).

---

## 1. Liste exhaustive des fichiers concernés

### Référencent `GEO_GATEWAYS` directement
- `src/components/globe/GlobeConfig.ts` — définition de la donnée
- `src/App.tsx`
- `src/utils/geoTopologySelection.ts`
- `src/utils/geoCoverageSelection.ts`
- `src/utils/geoConnectivityModel.ts` (ne référence pas la constante mais en définit toute la logique de résolution)
- `src/components/CommandPalette.tsx`
- `src/components/CesiumGlobe.tsx`
- `src/components/CapacityDetails.tsx`
- `src/components/GatewayDetails.tsx`
- `src/components/layout/MobileAnalysisSummary.tsx`
- `src/components/cesium-globe/GeoGatewayLayer.tsx`
- `src/components/cesium-globe/TransmissionLinks.tsx`
- `src/utils/__tests__/geoConnectivityModel.test.ts`

### Référencent les notions SCC / Gateway / Teleport / TT&C / Monitoring (sans forcément importer `GEO_GATEWAYS`)
- `src/utils/geoLinkBudget.ts` — paramètres RF du "Gateway Terminal" (EIRP/G-T commerciaux)
- `src/utils/geoDualSegmentBudget.ts` — applique ces paramètres au site résolu
- `src/utils/geoTerminalRFModel.ts` — modèle RF terminal utilisateur (use cases fixed/mobile/aviation/maritime), pas directement lié aux gateways mais partage le même espace conceptuel
- `src/components/capacity/GEOConnectivitySection.tsx`
- `src/components/capacity/DualSegmentPanel.tsx`
- `src/components/capacity/__tests__/GEOConnectivitySection.test.tsx`
- `src/components/CoverageSelector.tsx`
- `src/components/cesium-globe/InspectionCard.tsx`
- `src/components/commercial/commercialViewModel.ts`
- `src/components/commercial/commercialHelpers.ts`
- `src/components/commercial/CommercialNarrativePanel.tsx`
- `src/types/connectivityScenario.ts` (vocabulaire `'gateway'`, `'gateway-access'`)
- `src/services/geo/rfContextService.ts` + test associé
- `src/services/frequencyPlan/inference.ts`, `grouping.ts` — **"gateway" y désigne un concept différent** (le faisceau montant générique d'un plan de fréquence public), sans lien avec `GEO_GATEWAYS` (voir §1 note)
- `src/components/cesium-globe/siteTooltipHelpers.ts` — pas de référence directe, logique de tooltip générique par `LinkMode`

> **Note de portée** : la recherche large de "gateway" remonte aussi des dizaines de fichiers LEO/OneWeb
> (`leoConnectivityModel.ts`, `leoFootprint.ts`, `leoSiteToSiteModel.ts`, etc.) où "gateway" désigne les
> passerelles OneWeb/SNP, un système entièrement différent et hors périmètre de cette refonte GEO.
> Idem pour `frequencyPlan/inference.ts` et `grouping.ts` : leur "gateway" est un concept de faisceau montant
> public générique, indépendant de `GEO_GATEWAYS`.

---

## 2. Rôle exact par fichier, distinction implicite contrôle/trafic, et calculs link budget appliqués indifféremment

### `src/components/globe/GlobeConfig.ts`
- Définit `GeoGatewayData` (shape complète en §4) et la liste statique des 10 sites avec leur `role`.
- Aucune distinction de rôle n'est exploitée ici — c'est une simple table de données.

### `src/utils/geoConnectivityModel.ts` — **fichier pivot**
- Contient `GEO_GATEWAY_ASSIGNMENTS` : pour chaque satellite EUTELSAT, un `nominalSccCode`, un `backupSccCode`,
  et une liste `monitoringCodes`. C'est la **seule** logique métier qui distingue réellement SCC nominal / SCC
  backup / Monitoring — mais uniquement pour des besoins de **supervision satellite** (`getGroundSegmentRoutingForSatellite`,
  `GatewayDetails.tsx`).
- **Conflation directe** : `resolveGatewayForSatellite()` (ligne 455) résout le SCC nominal/backup d'un satellite.
  Cette même fonction est ensuite exposée sous **trois noms différents** qui sont strictement identiques :
  ```ts
  export function selectOperationalGeoGateway(...) { return toGatewaySelection(resolveGatewayForSatellite(...)); }
  export function selectTrafficGeoGateway(...)     { return toGatewaySelection(resolveGatewayForSatellite(...)); }
  ```
  (lignes 687–701) — `selectTrafficGeoGateway`, censé sélectionner le **teleport de trafic utilisateur**, retourne
  en réalité **le site SCC nominal/backup du satellite**. Concrètement : pour la quasi-totalité des satellites,
  le "traffic gateway" résolu est Rambouillet ou Turin (EMEA), Mexico City ou Hermosillo (Amériques) — qui sont
  tous des sites SCC, jamais Dubai/Singapore/Ibaraki/Perth/Martinique (les sites Monitoring/TTC).
- Un test verrouille explicitement cette conflation comme comportement voulu :
  `src/utils/__tests__/geoConnectivityModel.test.ts:142` — *"feeds link budget, traffic selection, and rendered
  connectivity path from the same gateway resolver"* — et le test ligne 38 s'appelle *"resolves every reference
  allocation entry to its nominal GEO teleport by default"* : **le vocabulaire interne du test appelle déjà le
  site SCC nominal un "teleport"**. Ce n'est donc pas un simple bug d'affichage UI mais une convention de
  nommage/conception déjà ancrée dans les tests.
- **Calcul physiquement non pertinent** : `analyzeGeoConnectivity()` (ligne 735) calcule une latence
  satellite↔gateway (RTT, `satGatewayLatencyMs`) en utilisant la position du site résolu — pertinent pour la
  géométrie, mais ce site est ensuite réutilisé tel quel comme extrémité d'un lien RF commercial (voir
  `geoDualSegmentBudget.ts` ci-dessous), ce qui n'a de sens que si le site dispose réellement d'un teleport
  Ku/Ka commercial colocalisé avec le SCC — hypothèse jamais vérifiée dans le code.

### `src/utils/geoLinkBudget.ts`
- Définit `GATEWAY_EIRP_DBW` et `GATEWAY_GT_DBK` (lignes 320–330) : paramètres RF d'un **teleport commercial
  type** (dish 4.5 m, HPA 100 W, EIRP 72–75 dBW Ku/Ka). Ces constantes ne référencent aucun site en particulier
  — elles sont **génériques par bande**, appliquées plus tard à n'importe quel `GeoGatewayData` reçu en paramètre.

### `src/utils/geoDualSegmentBudget.ts` — **où le calcul non pertinent se matérialise**
- `buildStarForwardResult()` (ligne 391) et `buildStarReturnResult()` (ligne 460) prennent un paramètre
  `gateway: GeoGatewayData` et lui appliquent directement `GATEWAY_EIRP_DBW[band]` / `GATEWAY_GT_DBK[band]`
  pour construire le segment uplink/downlink Gateway↔Satellite (C/N, marge de lien, MODCOD).
- Ces fonctions ne reçoivent **jamais** le `role` du gateway et ne le consultent pas. Le `gateway` injecté est
  systématiquement celui retourné par `selectTrafficGeoGateway` = le SCC nominal/backup (voir ci-dessus).
- **Conséquence physique concrète** : si un satellite a pour SCC nominal "Cagliari" (rôle `EMEA_SCC_Backup`,
  en réalité un site de télémesure/contrôle), le Forward/Return link budget commercial du produit (EIRP 72 dBW
  Ku, dish 4.5 m, etc.) est calculé comme si Cagliari hébergeait un teleport commercial Ku — ce qui n'est pas
  garanti et n'est vérifié nulle part dans le code.

### `src/utils/geoTopologySelection.ts`
- `selectBestTopologyPath()` (ligne 156) appelle `selectTrafficGeoGateway(satellite, gateways)` pour les modes
  `STAR_FORWARD`/`STAR_RETURN` (lignes 188, 220), puis construit un pool de candidats RF
  (`buildGatewayCandidatePool`, ligne 145) **à la position lat/lng du site résolu**, sans inspection de `role`.
  Le meilleur "topology path" retenu (et donc affiché à l'utilisateur comme la meilleure solution technique)
  dépend directement de ce site SCC traité comme teleport.

### `src/utils/geoCoverageSelection.ts`
- `findCandidateCoverages()` est un moteur générique : pour **n'importe quel point lat/lng**, il calcule un
  link budget complet (EIRP, G/T, FSPL, C/N0, MODCOD, throughput) via `computeUplinkBudget`/`computeDownlinkBudget`
  (import de `geoLinkBudget.ts`). Il ne sait pas ce qu'est un "gateway" — il prend des coordonnées en entrée.
  C'est ce moteur, appelé avec les coordonnées d'un site `GEO_GATEWAYS`, qui produit les chiffres "physiquement
  douteux" pour les sites SCC/Monitoring/TTC.

### `src/components/cesium-globe/GeoGatewayLayer.tsx`
- Rendu Cesium : **tous** les sites `GEO_GATEWAYS` sont dessinés identiquement (point cyan), avec un nom d'entité
  `${gateway.name} (Teleport)` (ligne 95) — y compris Dubai/Singapore/Ibaraki/Perth/Martinique qui ne sont pas
  des teleports. Aucune différenciation visuelle par `role`.
- Paramètre `allowedGatewayNames` (ligne 35) : commentaire *"Null (default) renders all gateways — engineering
  mode."* → c'est ici que vit la distinction ENG/COMM (voir §3), mais elle ne filtre que par **site actif pour
  la route en cours**, jamais par rôle métier.

### `src/components/cesium-globe/TransmissionLinks.tsx`
- Dessine, pour le site SCC résolu (`resolveGatewayForSatellite`, lignes 607 et 650) :
  - un lien "GEO Satellite → Gateway feeder link" (ligne 614)
  - un lien conceptuel **"GEO Gateway → Internet backhaul"** (ligne 631) — un site SCC/Monitoring se voit donc
    représenté visuellement avec un backhaul Internet commercial, concept qui n'a de sens que pour un vrai
    teleport de trafic.
- Contient un garde-fou dev existant : `logGatewayDesync()` (appelé lignes 605, 649) qui logge en `console.error`
  un message `[GEO Gateway Desync]` quand le gateway résolu localement diverge du gateway rendu — signe que
  l'équipe a déjà identifié empiriquement un risque d'incohérence entre "gateway RF" et "gateway affiché", sans
  pour autant distinguer les rôles métier.

### `src/components/GatewayDetails.tsx`
- Seul composant qui exploite réellement `GEO_GATEWAY_ASSIGNMENTS` pour différencier "Nominal SCC Satellites" /
  "Backup SCC Satellites" / "Monitored GEO Satellites" (lignes 31–44, 125–187) — il a donc déjà, dans son
  propre modèle de vue, le concept de "ce site sert le contrôle satellite", indépendamment du trafic.
- Mais le badge d'en-tête reste générique : `GEO Gateway` (ligne 89), et le tooltip décrit le site comme "the
  selected GEO teleport" (ligne 97), même quand `groundSegmentProfile` montre que son seul rôle réel est
  Monitoring.

### `src/components/CapacityDetails.tsx`
- Ligne 1517 : `selectTrafficGeoGateway(sat, GEO_GATEWAYS)` utilisé pour dériver `gwPosBySatId`, ensuite
  réinjecté dans `findCandidateCoverages()` (calcul RF complet) pour filtrer les satellites valides en mode
  STAR — encore une fois sans inspection de `role`.
- Ligne 2106 : `${resolvedGateway.gatewayName} (${resolvedGateway.role})` — ici `role` est `ResolvedGatewayRole`
  (`'nominal' | 'backup'`, type différent du `role: string` de `GeoGatewayData`, voir §4) — affiché tel quel,
  y compris pour des sites qui dans `GEO_GATEWAYS` portent un rôle Monitoring/TTC. Le PDF généré dira par
  exemple "Cagliari (nominal)" sans que "nominal" signifie autre chose que "SCC nominal pour ce satellite".
- Le fallback texte `'No eligible GEO teleport'` (présent dans le bloc PDF) renforce le vocabulaire "teleport"
  pour désigner n'importe quel site résolu.

### `src/components/capacity/GEOConnectivitySection.tsx`
- Ligne 743 : `const gatewayRole = resolvedGateway?.role ?? null;` — encore le `ResolvedGatewayRole` nominal/backup,
  pas le rôle métier SCC/TTC/Monitoring/Teleport de `GeoGatewayData`.
- Le composant affiche le nom + ce pseudo-rôle comme label de l'extrémité Gateway du lien budget, sans jamais
  vérifier la cohérence avec `GeoGatewayData.role`.

### `src/components/CoverageSelector.tsx`
- Ligne 441 : libellé statique `"GEO teleport side - reference allocation"` affiché sous chaque candidat
  uplink/downlink — généralise "teleport" à toute extrémité Gateway du lien, sans condition sur le rôle réel.

### `src/components/cesium-globe/InspectionCard.tsx`
- Ligne 222 : tooltip de survol d'un site `GEO_GATEWAYS`, libellé **codé en dur** `"GEO teleport"` pour le champ
  "Type", quel que soit le `role` réel du site (Dubai/CSC_Monitoring y est affiché "GEO teleport" au survol).

### `src/components/CommandPalette.tsx`
- Lignes 179–187 : la recherche globale (Cmd+K) indexe tous les `GEO_GATEWAYS` sous le libellé générique
  "Gateway · {region}" (pas de filtre/label par rôle).

### `src/components/layout/MobileAnalysisSummary.tsx`
- Affiche `'${region} teleport'` comme sous-titre pour tout site sélectionné, et appelle
  `getAssignedGeoSatellitesForGateway()` pour montrer les comptes primary/backup — reprend donc partiellement
  la logique SCC de `GatewayDetails.tsx`, mais le sous-titre reste "teleport".

### `src/components/commercial/commercialViewModel.ts` — **exposition côté narratif commercial**
- Lignes 293–317, 489–503, 622–630 : quand l'extrémité de la route est un GEO gateway, le narratif **commercial**
  (destiné à un public non-ingénieur) affiche en dur des libellés `'GEO teleport'` / `'Reference GEO teleport
  path'` / `destinationEndpointRole: 'GEO teleport'`, peu importe si le site réellement résolu est en fait un SCC
  ou un site de Monitoring. C'est la manifestation la plus visible côté utilisateur final de la conflation.

### `src/services/geo/rfContextService.ts` (+ test)
- À examiner plus en détail dans une prochaine itération si nécessaire ; le test confirme que le service consomme
  le même `resolvedGateway` que le reste de la chaîne RF (pas de filtrage par rôle observé dans le grep initial).

### `src/utils/geoTerminalRFModel.ts`
- Ne référence pas `GEO_GATEWAYS` directement ; définit le modèle RF du **terminal utilisateur** (`TerminalUseCase`,
  `TerminalRFClassId`). Pertinent pour le futur typage du rôle "Teleport" côté infra sol, par symétrie de modèle.

---

## 3. Mode ENG vs COMM — existe-t-il déjà ?

**Oui**, le mode existe sous les identifiants `uiMode: 'engineering' | 'commercial'` (`src/App.tsx`, ex. lignes
2176, 3571, 4578, 4716–4717). Bascule via `handleModeSwitch('engineering' | 'commercial')` (ligne 4578).

Comment ce mode affecte l'affichage des sites GEO_GATEWAYS :
- En mode **engineering**, `GeoGatewayLayer` reçoit `allowedGatewayNames = null` → **tous** les 10 sites sont
  rendus, sans distinction de rôle.
- En mode **commercial**, `commercialGatewayAllowlist` (`src/components/CesiumGlobe.tsx:2167`) ne contient
  **qu'un seul nom** : celui de `pulsedGateway`, qui est lui-même dérivé du même résolveur SCC
  (`resolveGatewayForSatellite`/`selectTrafficGeoGateway`). Le commentaire en ligne 2164-2165 dit explicitement :
  *"In commercial mode only the gateway that is active for the current GEO route is visible; the full
  GEO_GATEWAYS list is hidden."*
- **Conclusion** : la distinction ENG/COMM existante filtre par "site actif pour la route", **pas** par rôle
  métier SCC/TT&C/Monitoring/Teleport. En mode commercial, un site dont le rôle réel est `CSC_Monitoring` ou
  `EMEA_SCC_Backup` peut très bien être le seul site affiché, labellisé "GEO teleport" dans le narratif
  (`commercialViewModel.ts`), sans qu'aucun garde-fou ne l'empêche.
- Un mécanisme de détection de désynchronisation existe déjà côté dev (`logGatewayDesync` /
  `[GEO Gateway Desync]` dans `CesiumGlobe.tsx:2173-2186` et `TransmissionLinks.tsx`), mais il compare deux
  résolutions du **même** concept (gateway RF vs gateway rendu), pas une cohérence de rôle métier.

---

## 4. Types TypeScript à faire évoluer (shape actuelle complète)

### `GeoGatewayData` — `src/components/globe/GlobeConfig.ts:58`
```ts
export interface GeoGatewayData {
  teleportCode: string;
  gateway_id: string;
  name: string;
  latitude: number;
  longitude: number;
  supported_satellites: string[];
  lat: number;
  lng: number;
  region: string;
  role: string;   // libre, non typé, ex: 'Global_SCC_Nominal' | 'CSC_Monitoring' | 'TTC_Monitoring' | 'Relay_Monitoring' | '*_SCC_Backup'
}
```
C'est le type racine à faire évoluer en premier — `role: string` devra probablement devenir un ensemble de
rôles typés (potentiellement multiples, voir §5) plutôt qu'une chaîne libre.

### `GatewaySatelliteAssignment` — `src/utils/geoConnectivityModel.ts:67`
```ts
export interface GatewaySatelliteAssignment {
  satelliteName: string;
  satelliteId: string;
  nominalSccCode: GroundSegmentTeleportCode;
  backupSccCode: GroundSegmentTeleportCode | null;
  monitoringCodes: GroundSegmentTeleportCode[];
}
```
Encode déjà nominal/backup/monitoring mais au niveau "par satellite", sans notion de Teleport. Le nom
`GroundSegmentTeleportCode` (alias de `teleportCode`, lignes 55–65) confond lui-même "code de site sol" et
"teleport" dans son identifiant.

### `ResolvedGeoGateway` — `src/utils/geoConnectivityModel.ts:75`
```ts
export interface ResolvedGeoGateway {
  gatewayId: string;
  gatewayName: string;
  latitude: number;
  longitude: number;
  role: ResolvedGatewayRole;   // 'nominal' | 'backup' — PAS le même rôle que GeoGatewayData.role
  reason: string;
  assignmentSource: GatewayAssignmentSource;
  teleportCode: GroundSegmentTeleportCode | string;
  region: string;
  gateway: GeoGatewayData;     // contient le vrai role: string en doublon
  gatewayElevationDeg: number;
  satToGatewayDistanceKm: number;
}
```
**Collision de nom** : `ResolvedGeoGateway.role` (`'nominal'|'backup'`) et `GeoGatewayData.role` (string libre)
portent le même nom de champ pour deux notions différentes — source de confusion déjà visible dans le code
(`CapacityDetails.tsx:2106` et `GEOConnectivitySection.tsx:743` affichent `resolvedGateway.role`, pas
`gateway.role`).

### `GroundSegmentRouting` — `src/utils/geoConnectivityModel.ts:100`
```ts
export interface GroundSegmentRouting {
  satelliteId: string;
  satelliteName: string;
  nominalScc: GeoGatewayData | null;
  backupScc: GeoGatewayData | null;
  nominalMonitoring: GeoGatewayData | null;
  monitoring: GeoGatewayData[];
}
```
Déjà bien structuré pour SCC nominal/backup + Monitoring (multiple), utilisé seulement par `GatewayDetails.tsx`.
Ne couvre pas TT&C en tant que catégorie séparée de Monitoring, ni Teleport.

### `CandidateCoverage` — `src/types/analysis.ts:55`
```ts
export interface CandidateCoverage {
  satelliteId: string;
  satelliteName: string;
  missionName: string;
  coverageKey: string;
  coverageName: string;
  beamId: string;
  beamName: string;
  elevation: number;
  distanceFromBeamCenter: number;
  throughputEstimate: number;
  level: number | null;
  isUplink: boolean;
  isSynthesized?: boolean;
  eirpDbw?: number;
  gtDbk?: number;
  band?: 'C' | 'Ku' | 'Ka';
  frequencyGhz?: number;
  bandwidthMhz?: number;
  atmosphericLossDb?: number;
  slantRangeKm?: number;
  fsplDb?: number;
  cn0Dbhz?: number;
  cnDb?: number;
  linkMarginDb?: number;
  modcod?: string;
  spectralEfficiency?: number;
  latencyMs: number | null;
  status: CandidateCoverageStatus;   // 'available' | 'gateway_unavailable' | 'unstable'
  scoreBreakdown: CandidateCoverageScoreBreakdown;
  score: number;
}
```
Aucune référence à un rôle de site — c'est le moteur RF générique évoqué en §2 (`geoCoverageSelection.ts`).
Le statut `'gateway_unavailable'` est binaire et ne capture pas "site existant mais pas habilité Teleport".

### `GeoGatewaySelection` — `src/utils/geoConnectivityModel.ts:44`
```ts
export interface GeoGatewaySelection {
  gateway: GeoGatewayData;
  gatewayElevationDeg: number;
  satToGatewayDistanceKm: number;
}
```
Type de retour commun à `selectOperationalGeoGateway`/`selectTrafficGeoGateway`/`selectBestGeoGateway` —
symptôme direct de la fusion des notions "opérationnel" (contrôle) et "trafic".

### `SegmentEndpoint` / `LinkSegment` — `src/utils/geoDualSegmentBudget.ts:46`
```ts
export interface SegmentEndpoint {
  label: string;
  eirpDbw?: number;
  gtDbk?: number;
}
```
Générique, label texte libre — n'importe quel `GeoGatewayData` peut y être injecté sans validation de rôle.

### `connectivityScenario.ts` — vocabulaire `'gateway'` / `'gateway-access'`
Présent comme valeur de type littéral dans une union plus large (lignes 33, 53, 61) — à relire précisément si
la refonte touche ce fichier, non détaillé ici car hors du cœur GEO_GATEWAYS.

---

## 5. Endroits où le code suppose qu'un site = un seul rôle

- **`GeoGatewayData.role: string`** lui-même est un champ scalaire unique — la donnée source ne permet
  structurellement pas qu'un site cumule plusieurs rôles (ex. Rambouillet est SCC nominal **et** pourrait être
  un Teleport réel ; rien dans le type ne permettrait de le déclarer).
- **`GEO_GATEWAY_ASSIGNMENTS`** (`geoConnectivityModel.ts:281`) assigne un seul `nominalSccCode` et un seul
  `backupSccCode` par satellite — correct pour la fonction SCC, mais structurellement ce même `teleportCode`
  est réutilisé tel quel comme identifiant de "traffic gateway" dans `selectTrafficGeoGateway`, ce qui revient à
  supposer que le site SCC est *aussi* le site Teleport, sans qu'aucun champ ne le confirme ou l'infirme.
- **`GeoGatewayLayer.tsx`** rend chaque site comme une entité unique avec un seul jeu de propriétés visuelles
  (couleur, taille, label "(Teleport)") — pas de logique pour superposer plusieurs badges de rôle sur un même
  point.
- **`GatewayDetails.tsx`** calcule bien des listes (`nominalSccSatellites`, `backupSccSatellites`,
  `monitoredSatellites`) qui *peuvent* cumuler sur un même site (un site peut être nominal pour un satellite et
  backup pour un autre) — c'est le seul endroit qui gère correctement le cumul, mais uniquement pour les rôles
  SCC/Monitoring entre eux, jamais en intégrant une dimension Teleport.
- **`resolveGatewayForSatellite`** retourne `ResolvedGeoGateway | null` — un seul objet, jamais un ensemble de
  rôles simultanés pour le site retourné.
- **Le badge UI dans `App.tsx:3765`** dérive un unique badge d'affichage via une cascade de priorité
  (`role.includes('Monitoring') ? 'Monitoring' : role.includes('Backup') ? 'Backup SCC' : 'Nominal SCC'`) — donc
  même si un site cumulait SCC + Monitoring dans son `role` (concaténation de string), l'UI n'afficherait que la
  première correspondance trouvée dans cet ordre de priorité fixe, masquant le second rôle.

---

## Récapitulatif

| # | Question posée | Réponse |
|---|---|---|
| 1 | Tous les fichiers concernés | Listés en §1, avec mise en garde sur les faux positifs LEO/OneWeb et frequencyPlan |
| 2 | Rôle, distinction implicite, calculs RF non pertinents | Détaillé fichier par fichier en §2 ; conflation principale = `selectTrafficGeoGateway` ≡ `resolveGatewayForSatellite` (résolution SCC), qui alimente ensuite des calculs EIRP/G-T/MODCOD commerciaux (`geoDualSegmentBudget.ts`) sur des sites qui peuvent être de purs sites de contrôle/monitoring |
| 3 | Mode ENG vs COMM | Existe (`uiMode: 'engineering' \| 'commercial'`), mais ne filtre que par "site actif pour la route", pas par rôle métier |
| 4 | Types à faire évoluer | `GeoGatewayData`, `GatewaySatelliteAssignment`, `ResolvedGeoGateway` (collision de nom `role`), `GroundSegmentRouting`, `GeoGatewaySelection`, `CandidateCoverage.status`, `SegmentEndpoint` — shapes complètes en §4 |
| 5 | Hypothèse "un site = un seul rôle" | Structurelle dans `GeoGatewayData.role: string`, dans `GEO_GATEWAY_ASSIGNMENTS`, dans le rendu Cesium, et dans la logique de badge UI à priorité fixe ; seul `GatewayDetails.tsx` gère un cumul partiel (SCC nominal/backup/monitoring) sans intégrer Teleport |

Aucune modification de code n'a été effectuée. Ce rapport est la base pour discuter ensuite des options de
modélisation (enum de rôles multiples vs. capacités booléennes par site, séparation du résolveur SCC du
résolveur Teleport, etc.) — non traité ici comme demandé.
