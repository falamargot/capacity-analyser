import { useMemo, useReducer } from 'react';
import type { LinkMode } from '../../types/linkMode';
import type { TerminalType, WeatherType } from '../../components/capacity';
import type { TerminalRFClassId, TerminalRFCustomParams } from '../../utils/geoTerminalRFModel';
import { USE_CASE_DEFAULT_RF_CLASS } from '../../utils/geoTerminalRFModel';
import { getLeoTerminalProfile } from '../../config/leoTerminals';

/**
 * M3: single owner for the engineering scenario inputs that were previously
 * ~17 separate useState hooks in App. Pure data only — orchestration side
 * effects (SimulationContext weather sync, connectivityScenario dispatches,
 * terminal-class cascades) stay in the App handlers, which now write here
 * through setters with the exact same names and signatures as before.
 *
 * Direction is canonical here (`A_TO_B` / `B_TO_A`); the legacy GEO
 * `activeMeshTab` ('forward' / 'reverse') survives only as a derived adapter
 * until every consumer reads `direction` (M5).
 */

export type EngineeringDirection = 'A_TO_B' | 'B_TO_A';
export type LeoTopologyMode = 'SINGLE_SITE' | 'SITE_TO_SITE';
export type MeshTab = 'forward' | 'reverse';

export interface EngineeringScenarioState {
  linkMode: LinkMode;
  direction: EngineeringDirection;
  leoTopologyMode: LeoTopologyMode;
  leoTerminalType: TerminalType;
  leoTerminalModelId: string;
  leoTerminalTypeB: TerminalType;
  leoTerminalModelIdB: string;
  geoTerminalType: TerminalType;
  geoTerminalTypeB: TerminalType;
  geoRFClassIdA: TerminalRFClassId;
  geoRFClassIdB: TerminalRFClassId;
  geoRFCustomParamsA: TerminalRFCustomParams | null;
  geoRFCustomParamsB: TerminalRFCustomParams | null;
  weatherType: WeatherType;
  weatherTypeB: WeatherType;
  autoWeatherEnabled: boolean;
  autoWeatherEnabledB: boolean;
}

export const directionToMeshTab = (direction: EngineeringDirection): MeshTab => (
  direction === 'B_TO_A' ? 'reverse' : 'forward'
);

export const meshTabToDirection = (tab: MeshTab): EngineeringDirection => (
  tab === 'reverse' ? 'B_TO_A' : 'A_TO_B'
);

export function createInitialScenarioState(
  overrides: Partial<EngineeringScenarioState> = {},
): EngineeringScenarioState {
  return {
    linkMode: 'STAR_FORWARD',
    direction: 'A_TO_B',
    leoTopologyMode: 'SINGLE_SITE',
    leoTerminalType: 'fixed',
    leoTerminalModelId: getLeoTerminalProfile('fixed').id,
    leoTerminalTypeB: 'fixed',
    leoTerminalModelIdB: getLeoTerminalProfile('fixed').id,
    geoTerminalType: 'fixed',
    geoTerminalTypeB: 'fixed',
    geoRFClassIdA: USE_CASE_DEFAULT_RF_CLASS.fixed.Ku,
    geoRFClassIdB: USE_CASE_DEFAULT_RF_CLASS.fixed.Ku,
    geoRFCustomParamsA: null,
    geoRFCustomParamsB: null,
    weatherType: 'clear',
    weatherTypeB: 'clear',
    autoWeatherEnabled: true,
    autoWeatherEnabledB: true,
    ...overrides,
  };
}

type Updater<T> = T | ((previous: T) => T);

type ScenarioAction =
  | { [K in keyof EngineeringScenarioState]: { type: 'set'; field: K; value: Updater<EngineeringScenarioState[K]> } }[keyof EngineeringScenarioState]
  | { type: 'patch'; patch: Partial<EngineeringScenarioState> };

export function scenarioReducer(
  state: EngineeringScenarioState,
  action: ScenarioAction,
): EngineeringScenarioState {
  if (action.type === 'patch') {
    const changed = (Object.keys(action.patch) as Array<keyof EngineeringScenarioState>)
      .some((key) => action.patch[key] !== undefined && !Object.is(state[key], action.patch[key]));
    if (!changed) return state;
    const next = { ...state };
    for (const key of Object.keys(action.patch) as Array<keyof EngineeringScenarioState>) {
      const value = action.patch[key];
      if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    }
    return next;
  }
  const previous = state[action.field];
  const value = typeof action.value === 'function'
    ? (action.value as (prev: typeof previous) => typeof previous)(previous)
    : action.value;
  if (Object.is(previous, value)) return state;
  return { ...state, [action.field]: value };
}

export function useScenarioState(initialOverrides?: Partial<EngineeringScenarioState>) {
  const [scenario, dispatch] = useReducer(
    scenarioReducer,
    initialOverrides,
    (overrides) => createInitialScenarioState(overrides),
  );

  // dispatch identity is stable → all setters are stable for the app's lifetime.
  const setters = useMemo(() => {
    const set = <K extends keyof EngineeringScenarioState>(field: K) =>
      (value: Updater<EngineeringScenarioState[K]>) =>
        dispatch({ type: 'set', field, value } as ScenarioAction);
    const setDirection = set('direction');
    return {
      patchScenario: (patch: Partial<EngineeringScenarioState>) => dispatch({ type: 'patch', patch }),
      setLinkMode: set('linkMode'),
      setDirection,
      setActiveMeshTab: (value: Updater<MeshTab>) => {
        setDirection((previous) => meshTabToDirection(
          typeof value === 'function' ? value(directionToMeshTab(previous)) : value,
        ));
      },
      setLeoTopologyMode: set('leoTopologyMode'),
      setLeoTerminalType: set('leoTerminalType'),
      setLeoTerminalModelId: set('leoTerminalModelId'),
      setLeoTerminalTypeB: set('leoTerminalTypeB'),
      setLeoTerminalModelIdB: set('leoTerminalModelIdB'),
      setGeoTerminalType: set('geoTerminalType'),
      setGeoTerminalTypeB: set('geoTerminalTypeB'),
      setGeoRFClassIdA: set('geoRFClassIdA'),
      setGeoRFClassIdB: set('geoRFClassIdB'),
      setGeoRFCustomParamsA: set('geoRFCustomParamsA'),
      setGeoRFCustomParamsB: set('geoRFCustomParamsB'),
      setWeatherType: set('weatherType'),
      setWeatherTypeB: set('weatherTypeB'),
      setAutoWeatherEnabled: set('autoWeatherEnabled'),
      setAutoWeatherEnabledB: set('autoWeatherEnabledB'),
    };
  }, []);

  return {
    scenario,
    ...scenario,
    activeMeshTab: directionToMeshTab(scenario.direction),
    ...setters,
  };
}
