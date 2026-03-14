import { useCallback, useReducer, useMemo } from 'react';
import type { SatelliteData } from '../types/satellites';
import type { CandidateCoverage, SelectedSNP } from '../types/analysis';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import type { SNPData } from '../components/globe/GlobeConfig';

// ─── Analyzis position ────────────────────────────────────────────────────────
export interface AnalyzisPosition {
  lat: number;
  lng: number;
  altitude?: number;
  source: 'earth' | 'aircraft';
  aircraftCallsign?: string;
}

// ─── Selection modes ──────────────────────────────────────────────────────────
// Exactly ONE mode is active at any time. Each mode carries its own payload.
// Impossible states are unrepresentable.

export type SelectionMode =
  | { mode: 'idle' }
  | {
      mode: 'position';
      selectedPosition: { lat: number; lng: number; altitude?: number };
      analyzisPosition: AnalyzisPosition;
    }
  | {
      mode: 'aircraft';
      aircraft: Aircraft;
      analyzisPosition: AnalyzisPosition;
    }
  | {
      mode: 'vessel';
      vessel: Vessel;
      analyzisPosition: AnalyzisPosition;
    }
  | {
      mode: 'satellite';
      satellite: SatelliteData;
    }
  | {
      mode: 'snp';
      snp: SNPData;
    };

// ─── Full state shape ─────────────────────────────────────────────────────────
// Combines the discriminated selection mode with derived/secondary state that
// lives alongside it (auto-selected satellites, GEO coverage, hover state).

export interface SelectionState {
  selection: SelectionMode;

  // Auto-selected satellites (from position analysis)
  autoSelectedLEOId: string | null;
  autoSelectedGEOId: string | null;
  selectedSNP: SelectedSNP;

  // GEO coverage selection
  candidateCoverages: CandidateCoverage[];
  selectedCoverage: CandidateCoverage | null;
  selectedGeoMission: string | null;
  selectedGeoCoverageName: string | null;
  selectedGeoBeamId: string | null;

  // Hover state (independent of selection mode)
  hoveredSatelliteId: string | null;

  // Undo history
  history: SelectionMode[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type SelectionAction =
  | { type: 'SELECT_POSITION'; position: { lat: number; lng: number; altitude?: number }; analyzisPosition: AnalyzisPosition }
  | { type: 'SELECT_AIRCRAFT'; aircraft: Aircraft; analyzisPosition: AnalyzisPosition }
  | { type: 'SELECT_VESSEL'; vessel: Vessel; analyzisPosition: AnalyzisPosition }
  | { type: 'SELECT_SATELLITE'; satellite: SatelliteData }
  | { type: 'INSPECT_SNP'; snp: SNPData }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'UNDO' }
  | {
      type: 'SET_AUTO_SELECTED';
      leoId: string | null;
      geoId?: string | null;
      snp?: SelectedSNP;
    }
  | { type: 'SET_CANDIDATE_COVERAGES'; candidates: CandidateCoverage[]; autoGeoId: string | null }
  | { type: 'SET_SELECTED_COVERAGE'; coverage: CandidateCoverage | null }
  | { type: 'SET_GEO_MISSION'; mission: string | null }
  | { type: 'SET_GEO_COVERAGE_NAME'; name: string | null }
  | { type: 'SET_GEO_BEAM_ID'; beamId: string | null }
  | { type: 'SET_HOVERED_SATELLITE'; id: string | null }
  | { type: 'UPDATE_ANALYZIS_POSITION'; analyzisPosition: AnalyzisPosition };

// ─── Initial state ────────────────────────────────────────────────────────────

const MAX_HISTORY = 10;

const initialState: SelectionState = {
  selection: { mode: 'idle' },
  autoSelectedLEOId: null,
  autoSelectedGEOId: null,
  selectedSNP: null,
  candidateCoverages: [],
  selectedCoverage: null,
  selectedGeoMission: null,
  selectedGeoCoverageName: null,
  selectedGeoBeamId: null,
  hoveredSatelliteId: null,
  history: [],
};

// Reset the derived state that depends on the selection mode
function resetDerivedState(state: SelectionState): SelectionState {
  return {
    ...state,
    autoSelectedLEOId: null,
    autoSelectedGEOId: null,
    selectedSNP: null,
    candidateCoverages: [],
    selectedCoverage: null,
    selectedGeoMission: null,
    selectedGeoCoverageName: null,
    selectedGeoBeamId: null,
  };
}

function pushHistory(state: SelectionState): SelectionMode[] {
  const prev = state.selection;
  if (prev.mode === 'idle') return state.history;
  const next = [prev, ...state.history];
  return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'SELECT_POSITION':
      return {
        ...resetDerivedState(state),
        selection: {
          mode: 'position',
          selectedPosition: action.position,
          analyzisPosition: action.analyzisPosition,
        },
        history: pushHistory(state),
      };

    case 'SELECT_AIRCRAFT':
      return {
        ...resetDerivedState(state),
        selection: {
          mode: 'aircraft',
          aircraft: action.aircraft,
          analyzisPosition: action.analyzisPosition,
        },
        history: pushHistory(state),
      };

    case 'SELECT_VESSEL':
      return {
        ...resetDerivedState(state),
        selection: {
          mode: 'vessel',
          vessel: action.vessel,
          analyzisPosition: action.analyzisPosition,
        },
        history: pushHistory(state),
      };

    case 'SELECT_SATELLITE':
      return {
        ...resetDerivedState(state),
        selection: {
          mode: 'satellite',
          satellite: action.satellite,
        },
        history: pushHistory(state),
      };

    case 'INSPECT_SNP':
      return {
        ...resetDerivedState(state),
        selection: {
          mode: 'snp',
          snp: action.snp,
        },
        history: pushHistory(state),
      };

    case 'CLEAR_SELECTION':
      return {
        ...resetDerivedState(state),
        selection: { mode: 'idle' },
        hoveredSatelliteId: null,
        history: pushHistory(state),
      };

    case 'UNDO': {
      if (state.history.length === 0) {
        return state.selection.mode === 'idle' ? state : {
          ...resetDerivedState(state),
          selection: { mode: 'idle' },
          hoveredSatelliteId: null,
          history: [],
        };
      }
      const [prev, ...rest] = state.history;
      return {
        ...resetDerivedState(state),
        selection: prev,
        history: rest,
      };
    }

    case 'UPDATE_ANALYZIS_POSITION': {
      const sel = state.selection;
      if (sel.mode === 'position') {
        return {
          ...state,
          selection: { ...sel, analyzisPosition: action.analyzisPosition },
        };
      }
      if (sel.mode === 'aircraft') {
        return {
          ...state,
          selection: { ...sel, analyzisPosition: action.analyzisPosition },
        };
      }
      if (sel.mode === 'vessel') {
        return {
          ...state,
          selection: { ...sel, analyzisPosition: action.analyzisPosition },
        };
      }
      return state;
    }

    // ── Derived state updates (don't change selection mode) ───────────────

    case 'SET_AUTO_SELECTED':
      return {
        ...state,
        autoSelectedLEOId: action.leoId,
        ...(action.geoId !== undefined && { autoSelectedGEOId: action.geoId }),
        ...(action.snp !== undefined && { selectedSNP: action.snp }),
      };

    case 'SET_CANDIDATE_COVERAGES':
      return {
        ...state,
        candidateCoverages: action.candidates,
        autoSelectedGEOId: action.autoGeoId,
        selectedCoverage: action.candidates[0] ?? null,
      };

    case 'SET_SELECTED_COVERAGE':
      return { ...state, selectedCoverage: action.coverage };

    case 'SET_GEO_MISSION':
      return {
        ...state,
        selectedGeoMission: action.mission,
        selectedGeoBeamId: null,
        ...(action.mission ? { selectedGeoCoverageName: null } : {}),
      };

    case 'SET_GEO_COVERAGE_NAME':
      return {
        ...state,
        selectedGeoCoverageName: action.name,
        selectedGeoBeamId: null,
        ...(action.name ? { selectedGeoMission: null } : {}),
      };

    case 'SET_GEO_BEAM_ID':
      return {
        ...state,
        selectedGeoBeamId: action.beamId,
        ...(action.beamId ? { selectedGeoMission: null } : {}),
      };

    case 'SET_HOVERED_SATELLITE':
      return state.hoveredSatelliteId === action.id
        ? state
        : { ...state, hoveredSatelliteId: action.id };

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSelectionState() {
  const [state, dispatch] = useReducer(selectionReducer, initialState);

  // ── Convenience selectors ──────────────────────────────────────────────────
  // These extract commonly-needed values from the discriminated union so
  // consumers don't need to do mode-checks everywhere.

  const selectedPosition = useMemo((): { lat: number; lng: number; altitude?: number } | null => {
    const sel = state.selection;
    if (sel.mode === 'position') return sel.selectedPosition;
    return null;
  }, [state.selection]);

  const analyzisPosition = useMemo((): AnalyzisPosition | null => {
    const sel = state.selection;
    if (sel.mode === 'position') return sel.analyzisPosition;
    if (sel.mode === 'aircraft') return sel.analyzisPosition;
    if (sel.mode === 'vessel') return sel.analyzisPosition;
    return null;
  }, [state.selection]);

  const selectedSatellite = useMemo((): SatelliteData | null => {
    return state.selection.mode === 'satellite' ? state.selection.satellite : null;
  }, [state.selection]);

  const selectedAircraft = useMemo((): Aircraft | null => {
    return state.selection.mode === 'aircraft' ? state.selection.aircraft : null;
  }, [state.selection]);

  const selectedVessel = useMemo((): Vessel | null => {
    return state.selection.mode === 'vessel' ? state.selection.vessel : null;
  }, [state.selection]);

  const inspectedSNP = useMemo((): SNPData | null => {
    return state.selection.mode === 'snp' ? state.selection.snp : null;
  }, [state.selection]);

  // ── Dispatchers ────────────────────────────────────────────────────────────

  const selectPosition = useCallback(
    (position: { lat: number; lng: number; altitude?: number }, analyzisPos: AnalyzisPosition) => {
      dispatch({ type: 'SELECT_POSITION', position, analyzisPosition: analyzisPos });
    }, []
  );

  const selectAircraft = useCallback(
    (aircraft: Aircraft, analyzisPos: AnalyzisPosition) => {
      dispatch({ type: 'SELECT_AIRCRAFT', aircraft, analyzisPosition: analyzisPos });
    }, []
  );

  const selectVessel = useCallback(
    (vessel: Vessel, analyzisPos: AnalyzisPosition) => {
      dispatch({ type: 'SELECT_VESSEL', vessel, analyzisPosition: analyzisPos });
    }, []
  );

  const selectSatellite = useCallback(
    (satellite: SatelliteData) => {
      dispatch({ type: 'SELECT_SATELLITE', satellite });
    }, []
  );

  const inspectSNP = useCallback(
    (snp: SNPData) => {
      dispatch({ type: 'INSPECT_SNP', snp });
    }, []
  );

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const setAutoSelected = useCallback(
    (leoId: string | null, geoId?: string | null, snp?: SelectedSNP) => {
      dispatch({ type: 'SET_AUTO_SELECTED', leoId, geoId, snp });
    }, []
  );

  const setCandidateCoverages = useCallback(
    (candidates: CandidateCoverage[], autoGeoId: string | null) => {
      dispatch({ type: 'SET_CANDIDATE_COVERAGES', candidates, autoGeoId });
    }, []
  );

  const setSelectedCoverage = useCallback(
    (coverage: CandidateCoverage | null) => {
      dispatch({ type: 'SET_SELECTED_COVERAGE', coverage });
    }, []
  );

  const setGeoMission = useCallback(
    (mission: string | null) => {
      dispatch({ type: 'SET_GEO_MISSION', mission });
    }, []
  );

  const setGeoCoverageName = useCallback(
    (name: string | null) => {
      dispatch({ type: 'SET_GEO_COVERAGE_NAME', name });
    }, []
  );

  const setGeoBeamId = useCallback(
    (beamId: string | null) => {
      dispatch({ type: 'SET_GEO_BEAM_ID', beamId });
    }, []
  );

  const setHoveredSatellite = useCallback(
    (id: string | null) => {
      dispatch({ type: 'SET_HOVERED_SATELLITE', id });
    }, []
  );

  const updateAnalyzisPosition = useCallback(
    (analyzisPos: AnalyzisPosition) => {
      dispatch({ type: 'UPDATE_ANALYZIS_POSITION', analyzisPosition: analyzisPos });
    }, []
  );

  return {
    // Full state (for advanced consumers)
    state,
    dispatch,

    // Selection mode
    mode: state.selection.mode,
    selection: state.selection,

    // Derived convenience selectors
    selectedPosition,
    analyzisPosition,
    selectedSatellite,
    selectedAircraft,
    selectedVessel,
    inspectedSNP,

    // Auto-selected state
    autoSelectedLEOId: state.autoSelectedLEOId,
    autoSelectedGEOId: state.autoSelectedGEOId,
    selectedSNP: state.selectedSNP,

    // GEO coverage state
    candidateCoverages: state.candidateCoverages,
    selectedCoverage: state.selectedCoverage,
    selectedGeoMission: state.selectedGeoMission,
    selectedGeoCoverageName: state.selectedGeoCoverageName,
    selectedGeoBeamId: state.selectedGeoBeamId,

    // Hover
    hoveredSatelliteId: state.hoveredSatelliteId,

    // History
    canUndo: state.history.length > 0 || state.selection.mode !== 'idle',

    // Actions
    selectPosition,
    selectAircraft,
    selectVessel,
    selectSatellite,
    inspectSNP,
    clearSelection,
    undo,
    setAutoSelected,
    setCandidateCoverages,
    setSelectedCoverage,
    setGeoMission,
    setGeoCoverageName,
    setGeoBeamId,
    setHoveredSatellite,
    updateAnalyzisPosition,
  };
}

export type SelectionActions = ReturnType<typeof useSelectionState>;
