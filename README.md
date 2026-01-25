# Capacity Analyzer

Application React/Cesium pour l'analyse de couverture satellite LEO/GEO et le calcul de performance.

## Configuration du token Cesium ION

1. **Créer un compte Cesium ION** : https://cesium.com/ion/
2. **Obtenir un token** : https://cesium.com/ion/tokens
3. **Configurer le token** :

   Copiez `.env.example` vers `.env` :
   ```bash
   cp .env.example .env
   ```

   Remplacez `your_cesium_ion_token_here` par votre token réel :
   ```
   VITE_CESIUM_ION_ACCESS_TOKEN=votre_token_ici
   ```

## Développement

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Déploiement

Pour le déploiement (Vercel, Netlify, etc.), configurez la variable d'environnement :
- `VITE_CESIUM_ION_ACCESS_TOKEN` : votre token Cesium ION

## Fonctionnalités

- Visualisation 3D des satellites LEO/GEO
- Calcul de performance de liaison
- Couverture et empreintes au sol
- Interface interactive avec Cesium
