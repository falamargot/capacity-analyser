import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
  StripeMaterialProperty,
  StripeOrientation,
} from 'cesium';
import { useCesium } from 'resium';
import { BASE_OVERLAY_LAYER_HEIGHT_M } from './layerHeights';
import { getFiveGSpectrumCountryInfo } from '../../services/fiveGSpectrumService';
import { REGULATORY_OVERLAY_URL } from '../../services/regulatoryService';

const FIVE_G_SPECTRUM_OVERLAY_URL = REGULATORY_OVERLAY_URL;

let cachedDataSourcePromise: Promise<CustomDataSource> | null = null;

const loadFiveGSpectrumDataSource = (): Promise<CustomDataSource> => {
  if (cachedDataSourcePromise) return cachedDataSourcePromise;

  cachedDataSourcePromise = (async () => {
    const response = await fetch(FIVE_G_SPECTRUM_OVERLAY_URL);
    if (!response.ok) {
      throw new Error(`[FiveGSpectrumLayer] HTTP ${response.status} loading ${FIVE_G_SPECTRUM_OVERLAY_URL}`);
    }

    const geojson = await response.json() as any;
    const ds = new CustomDataSource('fiveg-spectrum-overlay');

    const addRing = (
      ring: number[][],
      countryName: string,
      isoA2: string | null,
      entityIndex: number,
    ) => {
      if (!Array.isArray(ring) || ring.length < 4) return;

      const degrees: number[] = [];
      for (const pt of ring) {
        if (Array.isArray(pt) && pt.length >= 2) {
          degrees.push(pt[0], pt[1]);
        }
      }
      if (degrees.length < 6) return;

      try {
        const positions = Cartesian3.fromDegreesArray(degrees);
        if (positions.length < 3) return;

        const spectrumInfo = getFiveGSpectrumCountryInfo(isoA2, countryName);
        const primaryColor = Color.fromCssColorString(spectrumInfo.fillColor).withAlpha(spectrumInfo.fillAlpha);
        const secondaryColor = spectrumInfo.secondaryFillColor
          ? Color.fromCssColorString(spectrumInfo.secondaryFillColor).withAlpha(spectrumInfo.fillAlpha)
          : null;
        const material = spectrumInfo.usesStripedFill && secondaryColor
          ? new StripeMaterialProperty({
              evenColor: primaryColor,
              oddColor: secondaryColor,
              repeat: 18,
              orientation: StripeOrientation.VERTICAL,
            })
          : new ColorMaterialProperty(primaryColor);

        ds.entities.add({
          id: `fiveg-country-${isoA2 ?? countryName}-${entityIndex}`,
          name: countryName,
          properties: {
            overlayType: '5g-spectrum',
            countryName,
            isoA2,
            status: spectrumInfo.status,
            statusLabel: spectrumInfo.statusLabel,
            bandLabel: spectrumInfo.bandLabel,
            deployedBandLabel: spectrumInfo.deployedBandLabel,
            plannedBandLabel: spectrumInfo.plannedBandLabel,
          },
          polygon: {
            hierarchy: positions,
            material,
            outline: false,
            height: BASE_OVERLAY_LAYER_HEIGHT_M,
            perPositionHeight: false,
          },
        });
      } catch {
        // Skip degenerate polygons silently.
      }
    };

    let entityIndex = 0;
    for (const feature of (geojson.features ?? [])) {
      const countryName = String(feature.properties?.name ?? '').trim();
      if (!countryName) continue;

      const isoA2 = typeof feature.properties?.isoA2 === 'string'
        ? feature.properties.isoA2
        : null;
      const { geometry } = feature;
      if (!geometry) continue;

      if (geometry.type === 'Polygon') {
        addRing(geometry.coordinates[0], countryName, isoA2, entityIndex);
        entityIndex += 1;
      } else if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
          addRing(polygon[0], countryName, isoA2, entityIndex);
          entityIndex += 1;
        }
      }
    }

    return ds;
  })();

  return cachedDataSourcePromise;
};

interface FiveGSpectrumLayerProps {
  visible: boolean;
}

const FiveGSpectrumLayer: React.FC<FiveGSpectrumLayerProps> = ({ visible }) => {
  const { viewer } = useCesium();
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const isAddedRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (!viewer) return;

    let cancelled = false;

    const attachLayer = async () => {
      try {
        const ds = await loadFiveGSpectrumDataSource();
        if (cancelled || viewer.isDestroyed()) return;

        dataSourceRef.current = ds;

        if (!isAddedRef.current) {
          const addedDataSource = await viewer.dataSources.add(ds);
          if (cancelled || viewer.isDestroyed()) {
            if (viewer.dataSources.contains(addedDataSource)) {
              viewer.dataSources.remove(addedDataSource, false);
            }
            return;
          }

          viewer.dataSources.lowerToBottom(addedDataSource);
          isAddedRef.current = true;
        }

        ds.show = visibleRef.current;
      } catch (error) {
        console.error('[FiveGSpectrumLayer] Failed to load overlay:', error);
        cachedDataSourcePromise = null;
      }
    };

    void attachLayer();

    return () => {
      cancelled = true;
      const ds = dataSourceRef.current;
      if (ds && !viewer.isDestroyed() && isAddedRef.current && viewer.dataSources.contains(ds)) {
        viewer.dataSources.remove(ds, false);
      }
      isAddedRef.current = false;
      dataSourceRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds) return;
    ds.show = visible;
  }, [visible]);

  return null;
};

export default FiveGSpectrumLayer;
