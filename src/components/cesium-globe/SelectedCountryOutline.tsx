import React, { useEffect, useMemo, useState } from 'react';
import { Entity } from 'resium';
import { Cartesian3, Color } from 'cesium';
import { COUNTRY_OUTLINE_LAYER_HEIGHT_M } from './layerHeights';
import { fetchRegulatoryOverlayGeoJson } from '../../services/regulatoryService';

interface CountryOutlineFeature {
  name: string;
  isoA2: string | null;
  outerRings: number[][][];
}

interface SelectedCountryOutlineProps {
  visible: boolean;
  countryName?: string | null;
  countryCode?: string | null;
  outlineColor: string;
}

let cachedOutlineFeaturesPromise: Promise<CountryOutlineFeature[]> | null = null;

const normalizeName = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const normalizeCountryCode = (value?: string | null) => value?.trim().toUpperCase() ?? '';

const extractOuterRings = (geometry: any): number[][][] => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return Array.isArray(geometry.coordinates?.[0]) ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .map((polygon: number[][][]) => polygon?.[0])
      .filter((ring: number[][] | undefined): ring is number[][] => Array.isArray(ring));
  }
  return [];
};

const loadOutlineFeatures = (): Promise<CountryOutlineFeature[]> => {
  if (cachedOutlineFeaturesPromise) return cachedOutlineFeaturesPromise;

  cachedOutlineFeaturesPromise = (async () => {
    const geojson = await fetchRegulatoryOverlayGeoJson();
    return (geojson.features ?? [])
      .map((feature: any) => ({
        name: String(feature.properties?.name ?? ''),
        isoA2: typeof feature.properties?.isoA2 === 'string' ? feature.properties.isoA2 : null,
        outerRings: extractOuterRings(feature.geometry),
      }))
      .filter((feature: CountryOutlineFeature) => feature.name && feature.outerRings.length > 0);
  })();

  return cachedOutlineFeaturesPromise;
};

const SelectedCountryOutline: React.FC<SelectedCountryOutlineProps> = ({
  visible,
  countryName = null,
  countryCode = null,
  outlineColor,
}) => {
  const [features, setFeatures] = useState<CountryOutlineFeature[] | null>(null);

  useEffect(() => {
    if (!visible || (!countryName && !countryCode)) return;

    let cancelled = false;

    void loadOutlineFeatures()
      .then((nextFeatures) => {
        if (!cancelled) {
          setFeatures(nextFeatures);
        }
      })
      .catch((error) => {
        console.error('[SelectedCountryOutline] Failed to load outline features:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, countryCode, countryName]);

  const outlineCesiumColor = useMemo(
    () => Color.fromCssColorString(outlineColor).withAlpha(0.96),
    [outlineColor],
  );

  const matchingPolylines = useMemo(() => {
    if (!visible || !features) return [];

    const targetCode = normalizeCountryCode(countryCode);
    const targetName = normalizeName(countryName);
    return features
      .filter((feature) => {
        if (targetCode) {
          return normalizeCountryCode(feature.isoA2) === targetCode;
        }
        return normalizeName(feature.name) === targetName;
      })
      .flatMap((feature) => feature.outerRings)
      .map((ring, index) => {
        const degreesWithHeights: number[] = [];
        for (const coordinate of ring) {
          if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
          const [lng, lat] = coordinate;
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
          degreesWithHeights.push(lng, lat, COUNTRY_OUTLINE_LAYER_HEIGHT_M);
        }
        if (degreesWithHeights.length < 9) return null;
        return {
          key: `${targetCode || targetName}-${index}`,
          positions: Cartesian3.fromDegreesArrayHeights(degreesWithHeights),
        };
      })
      .filter((entry): entry is { key: string; positions: Cartesian3[] } => entry !== null);
  }, [countryCode, countryName, features, visible]);

  if (!visible || matchingPolylines.length === 0) return null;

  return (
    <>
      {matchingPolylines.map((polyline) => (
        <Entity
          key={polyline.key}
          name={`Country outline ${countryName ?? countryCode ?? ''}`}
          polyline={{
            positions: polyline.positions,
            width: 3,
            material: outlineCesiumColor,
            clampToGround: false,
          }}
        />
      ))}
    </>
  );
};

export default React.memo(SelectedCountryOutline);
