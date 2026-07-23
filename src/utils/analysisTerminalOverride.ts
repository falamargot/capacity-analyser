import type { TerminalType } from '../components/capacity';
import type { TerminalRFClassId, TerminalRFCustomParams } from './geoTerminalRFModel';

export type AnalysisSource = 'earth' | 'aircraft' | undefined;

export interface GroundTerminalProfile {
  leoTerminalType: TerminalType;
  leoTerminalModelId: string;
  geoTerminalType: TerminalType;
  geoRFClassId: TerminalRFClassId;
  geoRFCustomParams: TerminalRFCustomParams | null;
}

export type TerminalProfileTransition =
  | { action: 'none'; savedGroundProfile: GroundTerminalProfile | null }
  | { action: 'apply-aviation'; savedGroundProfile: GroundTerminalProfile }
  | { action: 'restore-ground'; savedGroundProfile: null; profile: GroundTerminalProfile };

/**
 * Aircraft terminals are a temporary target constraint. This state transition
 * preserves the user's complete terrestrial/maritime profile and restores it
 * after leaving the aircraft, rather than silently replacing it with Fixed.
 */
export function resolveTerminalProfileTransition(args: {
  previousSource: AnalysisSource;
  currentSource: AnalysisSource;
  currentProfile: GroundTerminalProfile;
  savedGroundProfile: GroundTerminalProfile | null;
}): TerminalProfileTransition {
  if (args.currentSource === 'aircraft') {
    return {
      action: 'apply-aviation',
      savedGroundProfile: args.savedGroundProfile ?? args.currentProfile,
    };
  }

  if (args.previousSource === 'aircraft' && args.savedGroundProfile) {
    return {
      action: 'restore-ground',
      savedGroundProfile: null,
      profile: args.savedGroundProfile,
    };
  }

  return { action: 'none', savedGroundProfile: args.savedGroundProfile };
}
