# Panneau Commercial Flights - Spécification

## Vue d'ensemble
Un nouveau composant **AircraftDetails** a été créé pour afficher une liste détaillée des avions commerciaux lorsque "Commercial Flights" est activé.

## Fonctionnalités

### 1. **En-tête du Panneau**
- Titre : "Commercial Flights"
- Badge affichant le nombre total d'avions détectés
- Barre de recherche pour filtrer par:
  - Callsign (numéro de vol, ex: "AF1234")
  - Code ICAO 24-bit (identificateur unique)

### 2. **Tableau des Avions**
Le tableau affichable, trié et filtrable, avec les colonnes suivantes:

| Colonne | Information | Détails |
|---------|------------|---------|
| **Callsign** | Numéro de vol | Ex: "AF1234", "BA456" |
| **Altitude** | Hauteur de vol | En km et en mètres |
| **Vitesse** | Vitesse actuelle | En km/h et m/s |
| **Cap** | Direction de vol | En degrés (0-360°) |
| **ICAO** | Identification unique | Code hexadécimal 24-bit |
| **Coordonnées** | Position GPS | Latitude/Longitude en sous-affichage |

### 3. **Tri et Filtrage**
- **Clic sur en-tête de colonne** : Trier par cette colonne
- **Flèches de tri** : Indiquent la colonne active et la direction (↑ croissant, ↓ décroissant)
- **Barre de recherche** : Filtre en temps réel sur callsign ou ICAO
- Tri par défaut : Callsign (A-Z)

### 4. **Sélection d'Avion**
- **Cliquer sur une ligne** : Sélectionner l'avion
- **Surlignage** : Fond bleu clair pour l'avion sélectionné
- **Interaction sur la carte** : Les avions cliqués sur la carte mettent à jour la sélection

### 5. **Panneau de Détails (Bas)**
Affiche les informations détaillées de l'avion sélectionné:
- **Callsign** : Numéro de vol
- **ICAO 24-bit** : Code unique
- **Altitude** : Hauteur précise (km)
- **Vitesse** : Vitesse de croisière (km/h)
- **Coordonnées GPS** : Position précise avec décimales

### 6. **États d'Affichage**
- **Avions détectés** : Tableau rempli avec liste complète
- **Aucun avion** : Message "No commercial flights detected"
- **Désactivé** : Message "Commercial Flights disabled" (quand airTrafficEnabled = false)

## Intégration avec l'App

### État du Composant
```typescript
// Dans App.tsx
const [airTrafficEnabled, setAirTrafficEnabled] = useState(false);
const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
```

### Affichage Conditionnel
```typescript
{airTrafficEnabled ? (
  <AircraftDetails
    aircraft={interpolatedAircraft}      // Données des avions
    selectedAircraft={selectedAircraft}  // Avion sélectionné
    onAircraftSelect={setSelectedAircraft} // Callback de sélection
    enabled={airTrafficEnabled}           // Indicateur d'activation
  />
) : (
  <CapacityDetails ... /> // Affiche les satellites sinon
)}
```

## Style et UX
- **Design** : Cohérent avec le style existant (CapacityDetails, SatelliteDetails)
- **Couleurs** : Fond blanc, accents bleus (#3b82f6), gris pour les textes secondaires
- **Responsive** : Fonctionne sur desktop et mobile
- **Interaction** : Hover effects, transitions fluides
- **Scroll** : Liste scrollable, en-têtes collants

## Source de Données
- **API** : OpenSky Network (données ADS-B en temps réel)
- **Fréquence d'actualisation** : Toutes les 30 secondes
- **Filtrage** : Altitude > 5000m, callsign présent, position valide

## Fichiers Modifiés
1. **Nouveau** : [src/components/AircraftDetails.tsx](src/components/AircraftDetails.tsx) - Composant principal
2. **Modifié** : [src/App.tsx](src/App.tsx) - Intégration et import
