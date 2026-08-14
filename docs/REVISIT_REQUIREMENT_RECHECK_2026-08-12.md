# REVISIT — recheck du brief Payload OneWeb

**Date :** 2026-08-12  
**Source métier :** `Video simulation Payload Oneweb brief PPJ June 2026_GB copie.docx` (V1, 30 juin 2026)  
**Périmètre :** conformité fonctionnelle, perception démonstrateur, UIX et arbitrage des choix d'implémentation  
**Méthode :** lecture de la version révisée du DOCX (révisions suivies incluses), revue du code et des décisions d'architecture, test de l'application en navigateur desktop et mobile, exécution de la suite REVISIT (420 tests passants, 1 skipped).

## 1. Verdict exécutif

Le module **matche bien le besoin central** : il montre en 3D la valeur de plusieurs payloads EO hébergés sur la constellation OneWeb, met en évidence les satellites et leurs swaths, cible Londres ou d'autres points, et calcule un temps de revisit intelligible. Le moteur va nettement plus loin que le brief en rigueur : profil OneWeb HLD, spares, seam et échelle d'altitudes, WGS84, propagation Kepler + J2, validation GMAT, statistique worst-case et comparaison automatique des répartitions de payloads.

La conformité est cependant **incomplète sur la configurabilité demandée**. Le moteur sait représenter le biais instrument, une FOV elliptique ou rectangulaire, ses deux demi-angles et son clocking, mais l'UI ne permet pas de les éditer. Les points arbitraires sont sélectionnables sur le globe, pas saisis numériquement ; les zones sont limitées à trois presets ; les noms satellites ne sont pas affichables ; la navigation temporelle est un seek relatif sans horloge explicite ni commandes lecture/pause/avant/arrière.

Pour une démonstration exécutive, le risque principal n'est pas la crédibilité du calcul mais la **lecture du message commercial** :

- l'écran initial dit `12 × 48 · 576 sats`, alors que le brief rappelle 634 satellites au total ; le modèle contient bien 576 actifs + 58 spares, mais l'UI ne le dit pas ;
- la courbe brute n'est pas monotone : 24 payloads donnent 2 h 03, 32 donnent 2 h 46, 48 donnent 56 min, 64 donnent 2 h 40. C'est explicable par les topologies discrètes testées, mais cela contredit visuellement l'intuition « plus de payloads = meilleure revisit » ;
- le panneau `Model provenance` et la mention `Fit vs OneWeb TLE — not yet calibrated` occupent une place importante dès l'ouverture et peuvent fragiliser la confiance avant même que le récit de valeur commence ;
- le premier message sur l'indépendance du scénario telecom masque une partie du globe et parle d'architecture interne au lieu de valeur métier.

## 2. Matrice brief → module développé

| Attente du brief révisé | État | Constat dans REVISIT | Action recommandée |
|---|---|---|---|
| Démontrer simplement à des dirigeants la valeur de X payloads | **Conforme** | Slider principal, KPI worst-case, objectif configurable, phrase « You need N payloads » et courbe de valeur | Garder ce parcours executive-first |
| Constellation Walker Star ou Delta | **Conforme** | Choix STAR / DELTA dans Advanced | Aucun correctif fonctionnel |
| Nombre de plans P et satellites par plan S | **Conforme** | Champs P et S, validation bornée | Clarifier le passage d'un profil HLD à un Walker générique après édition |
| Inclinaison et altitude | **Conforme** | Champs dédiés, recalcul du scénario | Conserver |
| Facteur de phasage f | **Conforme** | Champ `Phasing f`, warning si non standard | Renommer `Walker phasing F` et ajouter une aide courte |
| Facteur `fudge` sur l'espacement RAAN | **Conforme, discutable** | Champ avancé 0,1–2 | Conserver uniquement en mode expert et le qualifier d'ajustement expérimental non standard |
| Sous-constellation x / y / z avec règles de divisibilité | **Conforme** | Listes limitées aux diviseurs valides, z borné, warning de dégénérescence | Très bon choix ; garder |
| Biais instrument par rapport au nadir | **Moteur seulement** | Supporté par `FovSpec` et le calcul, absent de l'UI | Ajouter deux champs avancés along-track / cross-track |
| FOV ellipse ou rectangle | **Moteur seulement** | Les deux formes sont supportées, mais aucune sélection UI | Ajouter forme + deux demi-angles + clocking dans Advanced |
| Presets de swath / instrument | **Partiel** | Narrow / Standard / Wide existent dans le domaine, mais ne sont pas exposés dans l'écran testé | Ajouter un choix simple `Narrow / Standard / Wide` près du scénario principal |
| Point défini par latitude / longitude | **Partiel** | Presets et clic sur le globe ; pas de saisie numérique explicite | Ajouter `lat/lon` et un bouton `Use map point` |
| Plusieurs emplacements | **Partiel** | Quatre presets, un seul target actif à la fois | Ajouter une comparaison multi-target si elle sert le pitch ; sinon expliciter « one target at a time » |
| Zone définie par une série de coordonnées | **Conforme** | Polygone utilisateur par dessin, liste de coordonnées ou import GeoJSON ; analyse sur grille et heatmap | Les anciennes zones de démonstration arbitraires ont été retirées pour garder un parcours métier explicite |
| Durée de propagation | **Conforme** | Durée et pas configurables ; 72 h par défaut | Conserver 72 h et le warning sous 24 h |
| Afficher/masquer les orbites | **Conforme** | Toggle `Orbits` | Conserver |
| Afficher/masquer les FOV/swaths | **Conforme** | Toggle `Swath` | Renommer éventuellement `Sensor swath` |
| Afficher toute la constellation ou seulement les payloads | **Conforme** | Toggle `Fleet` | Renommer `Host fleet` pour lever l'ambiguïté |
| Afficher/masquer les noms satellites | **Non conforme** | Pas de toggle ni de labels Pxx_Syy | Ajouter un toggle expert, désactivé par défaut pour éviter la surcharge |
| Sortie 3D avec Terre en rotation | **Conforme en perception** | Globe Cesium 3D et auto-rotation visuelle ; la physique tient compte de la rotation terrestre | Renommer `Spin` en `Auto-rotate globe` ; ne pas prétendre qu'il s'agit d'une commande temps |
| Satellites porteurs et swath colorés | **Conforme** | Payloads ambre, host fleet atténuée, swaths ambre | Très lisible ; conserver |
| Point cible et revisit visibles en bas de la simulation | **Conforme avec adaptation** | Target labellé sur le globe ; revisit proéminente à droite ; timeline en bas | Le déplacement du KPI est meilleur que le brief, mais garder la timeline comme ancrage bas |
| Horloge et navigation avant/arrière | **Partiel** | Seek 0–72 h au clic/clavier ; pas d'heure/date absolue, lecture/pause, pas avant/arrière explicites | Ajouter play/pause, ±1 h, vitesse et timestamp UTC |

## 3. Correctifs et améliorations priorisés

### P0 — avant une démonstration client

1. **Corriger la vérité affichée sur la flotte.** Remplacer `12 × 48 · 576 sats` par `576 active + 58 spare · 634 total`, en gardant `12 × 48 payload-capable` dans le détail. Le code modélise déjà les spares ; il s'agit d'un correctif de perception et de conformité au brief.

2. **Rendre la courbe commercialement lisible sans la rendre trompeuse.** En vue exécutive, afficher la frontière de performance `best revisit achievable with up to X payloads`, nécessairement non croissante, et garder les points de topologie bruts dans Details. À défaut, renommer le graphe `Best measured topology at each exact payload count` et annoter les ruptures de répartition. La phrase `You need 36 payloads` doit devenir `Minimum tested balanced configuration: 36 payloads`.

3. **Réduire les signaux de doute au premier écran.** Transformer `Model provenance` en badge compact `Validated model` ouvrant un détail. Ne pas afficher `not yet calibrated` comme verdict dominant : soit pré-calibrer avant la démo, soit écrire factuellement `HLD reference profile; live-TLE fit optional`. Ne jamais masquer la qualification `not trajectory-validated` dans le détail.

4. **Créer un vrai état Presenter/Demo.** Précharger un scénario et un objectif narratif, supprimer le toast d'indépendance telecom pendant la présentation, masquer les contrôles non utilisés, et proposer un reset en un clic. Le premier message doit être métier : `12 payloads → 3 h 26 worst-case over London; target is 2 h`.

5. **Ajouter des commandes temporelles explicites.** Play/pause, −1 h, +1 h, vitesse (1× / 10× / 100×) et timestamp `UTC`. Le seek actuel est bon et accessible, mais il ne remplit pas seul la perception d'une « simulation avec horloge ».

### P1 — prochain incrément fonctionnel

**Implémenté le 13 août 2026.** Les réglages instrument sont appliqués en une
seule transaction afin d'éviter un recalcul worker à chaque frappe. Les labels
sont limités aux satellites porteurs, désactivés par défaut, cadencés à 2 Hz et
plafonnés à 96 pour préserver lisibilité, mémoire GPU et fluidité.

1. ✅ Exposer `Narrow / Standard / Wide` dans le parcours principal, avec swath en km et avertissement `illustrative EO/IR preset`.
2. ✅ Exposer dans Advanced toute la géométrie déjà supportée par le moteur : biais along/cross-track, ellipse/rectangle, deux demi-angles, clocking et masque d'élévation.
3. ✅ Ajouter une saisie lat/lon et un toggle de labels satellites ; garder les labels désactivés par défaut.
4. ✅ Afficher clairement les changements de topologie lors du déplacement du slider : `12 payloads = 4 planes × 3`, avec transition textuelle immédiate vers la nouvelle répartition.
5. ✅ Faire du KPI un récit comparatif : `vs 1 payload`, `gain en %`, `payloads additionnels pour atteindre la cible`, tout en gardant worst-case comme métrique contractuelle.
6. ✅ Ajouter des scénarios de démo nommés : `London 2 h`, `Arctic high revisit`, `Equatorial challenge`, avec un court takeaway intégré au choix.

### P2 — amélioration produit, non bloquante pour la démo

**P2a implémenté le 13 août 2026 :** cycle de vie, scénarios nommés et partage
JSON, fiche résultat PDF et comparaison tabulaire de trois cibles.

**P2b-A implémenté le 13 août 2026 :** dessin d'une zone sur le globe, import
GeoJSON Polygon, collage d'une liste latitude/longitude, validation bornée et
persistance avec les scénarios P2a. Les datasheets réelles restent en P2b-B.

1. ✅ Dessin/import de polygone ou liste de coordonnées pour les zones.
2. ✅ Comparaison de plusieurs targets dans un tableau (bornée à trois cibles).
3. ✅ Sauvegarde et partage de scénarios nommés, export d'une fiche de résultat orientée client.
4. Presets instrument issus d'une vraie datasheet lorsque le produit payload est identifié.
5. ✅ Fermeture du gate de cycle de vie ENG/COMM/REVISIT avec instrumentation corrigée et budget vert sur 20 transitions.

## 4. Arbitrage des partis pris discutables

| Parti pris | Arbitrage | Motif |
|---|---|---|
| Worst-case max gap comme KPI principal | **À conserver** | Plus défendable contractuellement qu'une moyenne ; la moyenne reste visible |
| 72 h et exclusion des gaps tronqués aux bornes | **À conserver** | Évite une statistique flatteuse mais fausse sur une fenêtre trop courte |
| Kepler + J2 plutôt que TLE/SGP4 synthétiques | **À conserver** | Reproductible et adapté à une constellation paramétrique ; validé contre GMAT |
| WGS84 et altitude au-dessus du rayon équatorial | **À conserver, expliquer seulement en détail** | Choix techniquement solide, inutile à exposer dans le récit exécutif |
| Profil OneWeb HLD complet par défaut | **À conserver** | Plus crédible que l'ancien 12 × 8 de démonstration ; l'UI doit cependant montrer 634 total |
| Slider exécutif qui choisit automatiquement la meilleure répartition mesurée | **À conserver avec transparence** | Excellent pour la simplicité, mais il faut rendre visible que la topologie change et que les paliers ne sont pas imbriqués |
| Courbe brute par nombre exact de payloads | **À déplacer dans Details** | Scientifiquement honnête mais commercialement contre-intuitive ; utiliser une enveloppe de performance en Summary |
| `fudge` et f non entier | **À garder en expert uniquement** | Demandé par le brief, mais non standard Walker et facile à surinterpréter |
| Auto-rotation caméra/globe appelée `Spin` | **À renommer** | Visuellement satisfaisant, mais ne doit pas être confondu avec l'avancement du temps simulé |
| IR sans contrainte d'illumination | **À conserver avec caveat** | Cohérent avec le payload IR du brief ; ne pas généraliser à un capteur visible |
| FOV presets illustratifs sans datasheet | **Acceptable pour démonstration interne, pas pour chiffre client** | Le risque est déjà connu ; il doit être visible au moment où un résultat est exporté ou cité |
| Panneau de provenance toujours ouvert | **À replier par défaut** | La transparence doit rester accessible sans prendre le dessus sur le message métier |

## 5. Parcours de démonstration recommandé

1. Ouvrir sur Londres, 12 payloads, objectif 2 h, globe déjà cadré.
2. Dire la phrase résultat : `12 payloads donnent 3 h 26 worst-case ; l'objectif de 2 h demande 36 payloads dans la meilleure répartition testée.`
3. Déplacer le slider vers 36 et montrer simultanément les satellites ajoutés, la répartition par plans, le KPI et la timeline.
4. Basculer Londres → Longyearbyen ou Singapore pour montrer l'effet latitude.
5. Ouvrir `Why this revisit` uniquement si une question technique arrive.
6. Terminer sur une heatmap de zone preset et sur le caveat : modèle de mission paramétrique, pas outil d'ordonnancement opérationnel.

## 6. Conclusion

Le module est **déjà démontrable et techniquement crédible**. Il ne faut pas le réécrire. Le meilleur retour sur effort vient d'une couche de mise en scène et de clarification : vérité 634/576, courbe exécutive monotone et qualifiée, provenance repliée, horloge explicite, presets FOV visibles. Ensuite seulement viennent les entrées avancées manquantes, dont le moteur possède déjà la structure.
