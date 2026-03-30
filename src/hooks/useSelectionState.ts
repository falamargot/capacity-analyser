import { useCallback, useReducer } from 'react';
import type { Selection, SelectionPosition } from '../types/analysis';

type SelectionAction =
  | { type: 'SET'; selection: Selection }
  | { type: 'CLEAR' }
  | { type: 'UNDO' };

interface SelectionState {
  selectedSelection: Selection;
  history: Selection[];
}

const MAX_HISTORY = 10;

const initialState: SelectionState = {
  selectedSelection: { type: 'none' },
  history: [],
};

const isSameSelection = (left: Selection, right: Selection): boolean => JSON.stringify(left) === JSON.stringify(right);

const pushHistory = (history: Selection[], previous: Selection): Selection[] => {
  if (previous.type === 'none') return history;
  const next = [previous, ...history];
  return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
};

const selectionReducer = (state: SelectionState, action: SelectionAction): SelectionState => {
  switch (action.type) {
    case 'SET': {
      if (isSameSelection(state.selectedSelection, action.selection)) {
        return state;
      }

      return {
        selectedSelection: action.selection,
        history: pushHistory(state.history, state.selectedSelection),
      };
    }

    case 'CLEAR': {
      if (state.selectedSelection.type === 'none') {
        return state;
      }

      return {
        selectedSelection: { type: 'none' },
        history: pushHistory(state.history, state.selectedSelection),
      };
    }

    case 'UNDO': {
      const [previous, ...rest] = state.history;
      if (!previous) {
        return state.selectedSelection.type === 'none'
          ? state
          : { selectedSelection: { type: 'none' }, history: [] };
      }

      return {
        selectedSelection: previous,
        history: rest,
      };
    }

    default:
      return state;
  }
};

export function useSelectionState() {
  const [state, dispatch] = useReducer(selectionReducer, initialState);

  const updateSelection = useCallback((selection: Selection) => {
    dispatch({ type: 'SET', selection });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const undoSelection = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const selectSatellite = useCallback((satelliteId: string) => {
    dispatch({ type: 'SET', selection: { type: 'satellite', satelliteId } });
  }, []);

  const selectCoverage = useCallback((satelliteId: string, coverageId: string) => {
    dispatch({ type: 'SET', selection: { type: 'coverage', satelliteId, coverageId } });
  }, []);

  const selectContour = useCallback((satelliteId: string, coverageId: string, contourId: string) => {
    dispatch({ type: 'SET', selection: { type: 'contour', satelliteId, coverageId, contourId } });
  }, []);

  const selectTarget = useCallback(
    (targetType: 'point' | 'aircraft' | 'vessel', position: SelectionPosition) => {
      dispatch({ type: 'SET', selection: { type: 'target', targetType, position } });
    },
    []
  );

  return {
    selectedSelection: state.selectedSelection,
    history: state.history,
    canUndo: state.history.length > 0 || state.selectedSelection.type !== 'none',
    updateSelection,
    clearSelection,
    undoSelection,
    selectSatellite,
    selectCoverage,
    selectContour,
    selectTarget,
  };
}
