/**
 * useTerminalSelection — terminal type changes and the capability read models.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2, fifth slice). Small — six
 * blocks, ~35 lines — and worth moving for one reason: the two GEO handlers
 * carry a RULE, not just a setter. Changing a use case (maritime, aviation,
 * fixed) invalidates the RF class when the class no longer fits it, and the
 * replacement keeps the current BAND rather than dropping to a default. That
 * rule was three levels deep in a 6 000-line component and is now next to the
 * capability read models it governs.
 *
 * LEO's handlers are plain — a terminal type implies its model id — and are
 * here so the four live together.
 */

import { useCallback, useMemo } from 'react';
import {
  USE_CASE_DEFAULT_RF_CLASS, getRFClassBand, isRFClassCompatibleWithUseCase,
} from '../utils/geoTerminalRFModel';
import { getLeoTerminalProfile } from '../config/leoTerminals';
import { buildEngineeringEndpointTerminalCapabilities } from '../state/connectivityScenario/connectivityScenarioEngineeringSync';
import type { TerminalType } from '../components/capacity';
import type { TerminalRFClassId, TerminalRFCustomParams } from '../utils/geoTerminalRFModel';

export interface UseTerminalSelectionInput {
  geoRFClassIdA: TerminalRFClassId;
  geoRFClassIdB: TerminalRFClassId;
  geoTerminalType: TerminalType;
  geoTerminalTypeB: TerminalType;
  leoTerminalType: TerminalType;
  leoTerminalTypeB: TerminalType;
  leoTerminalModelId: string;
  leoTerminalModelIdB: string;
  setGeoTerminalType: (type: TerminalType) => void;
  setGeoTerminalTypeB: (type: TerminalType) => void;
  setLeoTerminalType: (type: TerminalType) => void;
  setLeoTerminalTypeB: (type: TerminalType) => void;
  setLeoTerminalModelId: (id: string) => void;
  setLeoTerminalModelIdB: (id: string) => void;
  setGeoRFClassIdA: (id: TerminalRFClassId) => void;
  setGeoRFClassIdB: (id: TerminalRFClassId) => void;
  setGeoRFCustomParamsA: (params: TerminalRFCustomParams | null) => void;
  setGeoRFCustomParamsB: (params: TerminalRFCustomParams | null) => void;
}

export function useTerminalSelection(input: UseTerminalSelectionInput) {
  const {
    geoRFClassIdA, geoRFClassIdB, geoTerminalType, geoTerminalTypeB,
    leoTerminalType, leoTerminalTypeB, leoTerminalModelId, leoTerminalModelIdB,
    setGeoTerminalType, setGeoTerminalTypeB, setLeoTerminalType, setLeoTerminalTypeB,
    setLeoTerminalModelId, setLeoTerminalModelIdB,
    setGeoRFClassIdA, setGeoRFClassIdB, setGeoRFCustomParamsA, setGeoRFCustomParamsB,
  } = input;

  const handleLeoTerminalTypeChange = useCallback((type: TerminalType) => {
    setLeoTerminalType(type);
    setLeoTerminalModelId(getLeoTerminalProfile(type).id);
  }, [setLeoTerminalModelId, setLeoTerminalType]);
  const handleLeoTerminalTypeBChange = useCallback((type: TerminalType) => {
    setLeoTerminalTypeB(type);
    setLeoTerminalModelIdB(getLeoTerminalProfile(type).id);
  }, [setLeoTerminalModelIdB, setLeoTerminalTypeB]);
  const handleGeoTerminalTypeChange = useCallback((type: TerminalType) => {
    setGeoTerminalType(type);
    if (!isRFClassCompatibleWithUseCase(geoRFClassIdA, type)) {
      const band = getRFClassBand(geoRFClassIdA) ?? 'Ku';
      setGeoRFClassIdA(USE_CASE_DEFAULT_RF_CLASS[type]?.[band] ?? USE_CASE_DEFAULT_RF_CLASS[type]?.Ku ?? 'ku_standard_vsat');
      setGeoRFCustomParamsA(null);
    }
  }, [geoRFClassIdA, setGeoRFClassIdA, setGeoRFCustomParamsA, setGeoTerminalType]);
  const handleGeoTerminalTypeBChange = useCallback((type: TerminalType) => {
    setGeoTerminalTypeB(type);
    if (!isRFClassCompatibleWithUseCase(geoRFClassIdB, type)) {
      const band = getRFClassBand(geoRFClassIdB) ?? 'Ku';
      setGeoRFClassIdB(USE_CASE_DEFAULT_RF_CLASS[type]?.[band] ?? USE_CASE_DEFAULT_RF_CLASS[type]?.Ku ?? 'ku_standard_vsat');
      setGeoRFCustomParamsB(null);
    }
  }, [geoRFClassIdB, setGeoRFClassIdB, setGeoRFCustomParamsB, setGeoTerminalTypeB]);
  const engineeringOriginTerminalCapabilities = useMemo(() => buildEngineeringEndpointTerminalCapabilities({
    geoRFClassId: geoRFClassIdA,
    geoTerminalType,
    leoTerminalModelId,
    leoTerminalType,
  }), [geoRFClassIdA, geoTerminalType, leoTerminalModelId, leoTerminalType]);
  const engineeringDestinationTerminalCapabilities = useMemo(() => buildEngineeringEndpointTerminalCapabilities({
    geoRFClassId: geoRFClassIdB,
    geoTerminalType: geoTerminalTypeB,
    leoTerminalModelId: leoTerminalModelIdB,
    leoTerminalType: leoTerminalTypeB,
  }), [geoRFClassIdB, geoTerminalTypeB, leoTerminalModelIdB, leoTerminalTypeB]);

  return {
    handleLeoTerminalTypeChange,
    handleLeoTerminalTypeBChange,
    handleGeoTerminalTypeChange,
    handleGeoTerminalTypeBChange,
    engineeringOriginTerminalCapabilities,
    engineeringDestinationTerminalCapabilities,
  };
}
