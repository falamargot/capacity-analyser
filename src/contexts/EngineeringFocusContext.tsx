import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { EngineeringCauseStageId } from '../utils/engineeringAnalysisViewModel';
import type { EngineeringTruthSet } from '../utils/engineeringAnalysisViewModel';
import {
  applyEngineeringFocusIntent,
  EMPTY_ENGINEERING_FOCUS,
  type EngineeringAnalyticalFocus,
  type EngineeringFocusOrigin,
} from '../utils/engineeringFocusModel';

export interface EngineeringFocusController {
  truths: EngineeringTruthSet;
  focus: EngineeringAnalyticalFocus;
  preview: (technology: 'GEO' | 'LEO', stageId: EngineeringCauseStageId, origin: EngineeringFocusOrigin) => void;
  lock: (technology: 'GEO' | 'LEO', stageId: EngineeringCauseStageId, origin: EngineeringFocusOrigin) => void;
  clearPreview: () => void;
  clear: () => void;
}

const noop = () => {};
const defaultController: EngineeringFocusController = {
  truths: {},
  focus: EMPTY_ENGINEERING_FOCUS,
  preview: noop,
  lock: noop,
  clearPreview: noop,
  clear: noop,
};

const EngineeringFocusContext = createContext<EngineeringFocusController>(defaultController);

// This file intentionally colocates the provider and its controller hook so the
// shared interaction state has one ownership boundary.
// eslint-disable-next-line react-refresh/only-export-components
export const useEngineeringFocusController = (): EngineeringFocusController => {
  const [focus, setFocus] = useState<EngineeringAnalyticalFocus>(EMPTY_ENGINEERING_FOCUS);

  const preview = useCallback((technology: 'GEO' | 'LEO', stageId: EngineeringCauseStageId, origin: EngineeringFocusOrigin) => {
    setFocus((current) => {
      if (current.kind === 'preview' && current.technology === technology && current.stageId === stageId && current.origin === origin) return current;
      return applyEngineeringFocusIntent(current, { type: 'preview', technology, stageId, origin });
    });
  }, []);

  const lock = useCallback((technology: 'GEO' | 'LEO', stageId: EngineeringCauseStageId, origin: EngineeringFocusOrigin) => {
    setFocus((current) => applyEngineeringFocusIntent(current, { type: 'lock', technology, stageId, origin }));
  }, []);

  const clearPreview = useCallback(() => {
    setFocus((current) => applyEngineeringFocusIntent(current, { type: 'clear-preview' }));
  }, []);

  const clear = useCallback(() => setFocus((current) => applyEngineeringFocusIntent(current, { type: 'clear' })), []);
  return useMemo(() => ({
    truths: {},
    focus,
    preview,
    lock,
    clearPreview,
    clear,
  }), [clear, clearPreview, focus, lock, preview]);
};

export const EngineeringFocusProvider = ({
  controller,
  truths,
  children,
}: {
  controller: EngineeringFocusController;
  truths: EngineeringTruthSet;
  children: React.ReactNode;
}) => (
  <EngineeringFocusContext.Provider value={{ ...controller, truths }}>
    {children}
  </EngineeringFocusContext.Provider>
);

// eslint-disable-next-line react-refresh/only-export-components
export const useEngineeringFocus = () => useContext(EngineeringFocusContext);
