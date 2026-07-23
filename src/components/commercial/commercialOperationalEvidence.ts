import type { TerminalType } from '../capacity';
import type { ActiveLeoRouteEvidence } from '../../utils/activeLeoRouteEvidence';
import type { NetworkLayerResult } from '../../utils/geoNetworkLayer';
import type { CommercialCriteriaEvidence, CommercialCriterionEvidence } from './commercialCriteriaEvidence';
import type { CommercialResilienceAssessment } from './commercialObjective';

type OperationalEvidence = Partial<
  Pick<CommercialCriteriaEvidence, 'dutyCycle' | 'contention' | 'serviceDiversity' | 'mobilityFit'>
>;

interface MobilityEvidenceInput {
  technology: 'geo' | 'leo';
  terminalType: TerminalType | null | undefined;
  terminalLabel?: string | null;
  /** A known platform class tightens the generic "operation in motion" gate. */
  requiredClass?: 'generic' | 'aviation';
}

interface GeoContentionInput {
  forward?: NetworkLayerResult | null;
  reverse?: NetworkLayerResult | null;
}

interface ResilienceEvidenceInput {
  geoRouteAvailable: boolean;
  leoRouteAvailable: boolean;
  geoGroundNode?: string | null;
  leoGroundNodes?: Array<string | null | undefined>;
  geoBand?: string | null;
  leoBand?: string | null;
}

const criterion = <T extends number | boolean>(
  value: T | null,
  unit: string | undefined,
  nature: CommercialCriterionEvidence<T>['nature'],
  source: string,
  note: string,
): CommercialCriterionEvidence<T> => ({ value, unit, nature, source, asOf: null, note });

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function displayBand(value: string): string {
  if (value === 'KU') return 'Ku';
  if (value === 'KA') return 'Ka';
  return value;
}

/**
 * Mobility is a terminal property, never an orbit property. The selected
 * terminal family is an explicit scenario input; a fixed terminal is therefore
 * an explicit incompatibility while a missing profile remains unknown.
 */
export function buildTerminalMobilityEvidence(
  input: MobilityEvidenceInput,
): CommercialCriterionEvidence<boolean> {
  const technology = input.technology.toUpperCase();
  if (!input.terminalType) {
    return criterion<boolean>(
      null,
      undefined,
      'inferred',
      `${technology} selected terminal profile`,
      'No terminal mobility class is selected; compatibility is not assessed.',
    );
  }
  const requiredClass = input.requiredClass ?? 'generic';
  const compatible = requiredClass === 'aviation'
    ? input.terminalType === 'aviation'
    : input.terminalType !== 'fixed';
  const label = input.terminalLabel?.trim() || input.terminalType;
  return criterion<boolean>(
    compatible,
    undefined,
    'inferred',
    `${technology} selected terminal profile (${label})`,
    compatible
      ? `The selected ${input.terminalType} terminal family matches the ${requiredClass === 'aviation' ? 'aircraft' : 'operation-in-motion'} scenario class. Certification and vehicle/vessel/airframe integration remain operator checks.`
      : requiredClass === 'aviation'
        ? `The selected ${input.terminalType} terminal family is not an aviation terminal; aircraft installation requires an aviation-class profile.`
        : 'The selected terminal family is fixed-installation equipment and is not suitable for operation in motion.',
  );
}

/**
 * LEO load is expressed as simulated active sessions sharing the beam. This is
 * useful operational evidence, but is not an operator contention ratio and is
 * deliberately not cross-scored against GEO topology assumptions.
 */
export function buildLeoContentionEvidence(
  route: ActiveLeoRouteEvidence | null | undefined,
): CommercialCriterionEvidence<number> {
  const snapshots = [route?.debugEvidence.siteA, route?.debugEvidence.siteB].filter(Boolean);
  const samples = snapshots.flatMap((snapshot) => [
    snapshot?.downlink.network.activeUsers,
    snapshot?.uplink.network.activeUsers,
  ]).filter((value): value is number => value != null && Number.isFinite(value) && value >= 1);

  if (!samples.length) {
    return criterion<number>(
      null,
      'equivalent active sessions',
      'estimated',
      'LEO simulated beam-load model',
      'No valid beam-load sample is available for the selected route.',
    );
  }

  const conservativeSessions = Math.max(...samples);
  return criterion<number>(
    conservativeSessions,
    'equivalent active sessions',
    'estimated',
    'LEO simulated beam-load model',
    `Conservative maximum across ${samples.length} route-direction sample${samples.length === 1 ? '' : 's'}. This is simulated load, not operator telemetry or a contractual contention ratio.`,
  );
}

/**
 * GEO exposes the topology model's sharing factor. A value of 1x means the
 * current model assumes no statistical sharing; it does not prove an unloaded
 * commercial carrier.
 */
export function buildGeoContentionEvidence(
  networkLayer: GeoContentionInput | null | undefined,
): CommercialCriterionEvidence<number> {
  const samples = [networkLayer?.forward?.contentionRatio, networkLayer?.reverse?.contentionRatio]
    .filter((value): value is number => value != null && Number.isFinite(value) && value >= 1);
  if (!samples.length) {
    return criterion<number>(
      null,
      'sharing factor',
      'modeled',
      'GEO topology network-layer model',
      'No network-layer sharing assumption is available for the selected route.',
    );
  }
  const conservativeRatio = Math.max(...samples);
  return criterion<number>(
    conservativeRatio,
    'sharing factor',
    'modeled',
    'GEO topology network-layer model',
    `${conservativeRatio.toFixed(1)}x is a planning assumption applied to the selected topology, not measured operator load. It is not scored against LEO simulated sessions.`,
  );
}

/**
 * Duty cycle and within-technology service diversity remain explicitly
 * unassessed. Handover loss is not duty cycle, and one selected route is not
 * proof of a redundant service path.
 */
export function buildUnassessedOperationalEvidence(
  technology: 'geo' | 'leo',
): Pick<OperationalEvidence, 'dutyCycle' | 'serviceDiversity'> {
  const label = technology.toUpperCase();
  return {
    dutyCycle: criterion<number>(
      null,
      '% usable time',
      'estimated',
      `${label} route evidence`,
      'Not assessed: no canonical time-window service-occupancy model is available. Availability and handover factors are not relabelled as duty cycle.',
    ),
    serviceDiversity: criterion<number>(
      null,
      'independence index',
      'inferred',
      `${label} selected route`,
      'Not scored per technology: a selected route does not prove an independent alternate satellite, gateway, operator, backhaul or power domain.',
    ),
  };
}

export function buildOperationalEvidence(args: {
  mobility: MobilityEvidenceInput;
  contention: CommercialCriterionEvidence<number>;
}): OperationalEvidence {
  return {
    ...buildUnassessedOperationalEvidence(args.mobility.technology),
    contention: args.contention,
    mobilityFit: buildTerminalMobilityEvidence(args.mobility),
  };
}

/**
 * Pairwise resilience belongs to the combined GEO+LEO architecture. This
 * assessment records only independence that can be demonstrated from the
 * selected routes; provider/control-plane and terrestrial dependencies remain
 * unknown until authoritative inventory data is connected.
 */
export function buildCommercialResilienceAssessment(
  input: ResilienceEvidenceInput,
): CommercialResilienceAssessment {
  const independentDomains: string[] = [];
  const sharedRiskDomains: string[] = [];
  const unknownDomains: string[] = [];

  if (input.geoRouteAvailable && input.leoRouteAvailable) {
    independentDomains.push('Distinct orbital service architectures (GEO and LEO)');
  } else {
    unknownDomains.push('Orbital architecture diversity requires two deliverable routes');
  }

  const geoGround = input.geoGroundNode?.trim();
  const leoGround = (input.leoGroundNodes ?? []).map((name) => name?.trim()).filter((name): name is string => !!name);
  if (geoGround && leoGround.length) {
    const geoKey = normalizedName(geoGround);
    const leoKeys = new Set(leoGround.map(normalizedName));
    if (leoKeys.has(geoKey)) {
      sharedRiskDomains.push(`Shared named ground entry point (${geoGround})`);
    } else {
      independentDomains.push(`Distinct named ground entry points (${geoGround} / ${leoGround.join(' / ')})`);
    }
  } else {
    unknownDomains.push('Ground-entry-point independence not fully resolved');
  }

  const geoBand = input.geoBand?.trim().toUpperCase();
  const leoBand = input.leoBand?.trim().toUpperCase();
  if (geoBand && leoBand) {
    if (geoBand === leoBand) {
      sharedRiskDomains.push(`Shared ${displayBand(geoBand)}-band propagation and interference exposure`);
    } else {
      independentDomains.push(`Distinct RF bands (${displayBand(geoBand)} / ${displayBand(leoBand)})`);
    }
  } else {
    unknownDomains.push('Cross-technology RF-band diversity not fully resolved');
  }

  unknownDomains.push(
    'Operator and control-plane independence not verified',
    'Terrestrial backhaul, facility power and peering independence not verified',
  );

  return {
    independentDomains,
    sharedRiskDomains,
    unknownDomains,
    assessedDomainCount: independentDomains.length + sharedRiskDomains.length,
    totalDomainCount: 5,
  };
}
