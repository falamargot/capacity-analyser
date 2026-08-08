/**
 * Shared physical validation for every REVISIT analysis entry point.
 *
 * Point analysis, payload sweeps and area grids are separate orchestration
 * paths, but they must accept and reject the same constellation, instrument and
 * time-window inputs. Keeping the common contract here prevents one output from
 * producing plausible numbers after another has rejected the scenario.
 */

import type {
    AnalysisWindow, FovSpec, RevisitScenario, Target, WalkerSpec,
} from '../domain/types';
import { validateSelection } from '../domain/subConstellation';
import { validateWalkerSpec } from '../domain/walker';
import {
    mergeValidations, validateFovSpec, validateReferenceBounds, validateTarget,
    type InputValidation,
} from '../domain/inputValidation';
import { validateWindow } from './accessIntervals';

/** Inputs shared by point and area analysis, excluding the point target. */
export function validateScenarioBase(
    scenario: Omit<RevisitScenario, 'target'>
): InputValidation {
    return mergeValidations(
        validateWalkerSpec(scenario.reference),
        validateSelection(scenario.reference, scenario.selection),
        validateWindow(scenario.window),
        validateFovSpec(scenario.payload, scenario.reference.altitudeKm),
        validateReferenceBounds(
            scenario.reference.altitudeKm,
            scenario.reference.fudge,
            scenario.reference.phasingF,
            scenario.reference.planes,
            scenario.reference.satsPerPlane,
        ),
    );
}

/** Complete validation for a point scenario. */
export function validateScenario(scenario: RevisitScenario): InputValidation {
    const { target, ...base } = scenario;
    return mergeValidations(validateScenarioBase(base), validateTarget(target));
}

/**
 * Validate the independently callable sweep path.
 *
 * The sweep enumerates its own strides, so only the held plane shift needs a
 * representative selection here.
 */
export function validateSweepInputs(
    reference: WalkerSpec,
    target: Target,
    payload: FovSpec,
    window: AnalysisWindow,
    planeShift: number,
): InputValidation {
    return validateScenario({
        reference,
        target,
        payload,
        window,
        selection: { planeStride: 1, satStride: 1, planeShift },
    });
}
