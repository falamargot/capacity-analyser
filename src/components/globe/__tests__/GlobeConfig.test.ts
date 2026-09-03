import { describe, expect, it } from 'vitest';
import {
  GEO_GATEWAYS, getGatewayTrafficStatusNote, getGroundSiteRoleLabel,
  getPrimaryControlRoleLabel, secondaryGroundRoleLabel, type GatewayTrafficStatus,
} from '../GlobeConfig';
import { GEO_GROUND_SITES, getLegacyGroundRolesForSite, hasControlRole } from '../../../utils/geoGroundInfrastructure';

describe('getGatewayTrafficStatusNote', () => {
  it('returns null for CONFIRMED — no note shown, no badge', () => {
    expect(getGatewayTrafficStatusNote('CONFIRMED')).toBeNull();
  });

  it('returns a non-null, sober note for PUBLICLY_LIKELY', () => {
    const note = getGatewayTrafficStatusNote('PUBLICLY_LIKELY');
    expect(note).not.toBeNull();
    expect(note).toMatch(/not internally confirmed/i);
    // Sober tone guard: must not use alarmist vocabulary.
    expect(note?.toLowerCase()).not.toMatch(/warning|risk|danger|fail|error/);
  });

  it('returns a distinct non-null note for UNVERIFIED', () => {
    const note = getGatewayTrafficStatusNote('UNVERIFIED');
    expect(note).not.toBeNull();
    expect(note).not.toBe(getGatewayTrafficStatusNote('PUBLICLY_LIKELY'));
  });

  it('returns a non-null note for NOT_APPLICABLE, identical to UNVERIFIED', () => {
    expect(getGatewayTrafficStatusNote('NOT_APPLICABLE')).toBe(getGatewayTrafficStatusNote('UNVERIFIED'));
  });

  it('covers all four GatewayTrafficStatus values explicitly (no implicit fallback)', () => {
    const allStatuses: GatewayTrafficStatus[] = ['CONFIRMED', 'PUBLICLY_LIKELY', 'UNVERIFIED', 'NOT_APPLICABLE'];
    for (const status of allStatuses) {
      // Must not throw — the exhaustive switch's `never` guard would fail to
      // compile before this could throw at runtime, but this also documents
      // the four-way coverage at the test level.
      expect(() => getGatewayTrafficStatusNote(status)).not.toThrow();
    }
  });
});

describe('GEO_GATEWAYS trafficStatus data integrity', () => {
  it('only RAM/CAG/TUR/MEX/HER are PUBLICLY_LIKELY, matching the documented mapping', () => {
    const publiclyLikely = GEO_GATEWAYS.filter((g) => g.trafficStatus === 'PUBLICLY_LIKELY').map((g) => g.teleportCode).sort();
    expect(publiclyLikely).toEqual(['CAG', 'HER', 'MEX', 'RAM', 'TUR']);
  });

  it('MAR/DUB/SIN/IBA/PER are UNVERIFIED, never CONFIRMED by accident', () => {
    const unverified = GEO_GATEWAYS.filter((g) => g.trafficStatus === 'UNVERIFIED').map((g) => g.teleportCode).sort();
    expect(unverified).toEqual(['DUB', 'IBA', 'MAR', 'PER', 'SIN']);
  });

  it('no site is CONFIRMED yet — promotion is a deliberate future data change', () => {
    expect(GEO_GATEWAYS.some((g) => g.trafficStatus === 'CONFIRMED')).toBe(false);
  });
});

/*
 * ── A site is never labelled with a control role it does not have ───────────
 *
 * `getPrimaryControlRoleLabel` used to fall through to 'Nominal SCC' for ANY
 * role set. Seven ground sites carry no control role — six teleport-only, one
 * with none at all — and all of them are drawn on the globe and selectable, so
 * the badge asserted a satellite-control role that does not exist.
 */
describe('ground-site role labelling', () => {
  it('returns null when a site has no control role', () => {
    expect(getPrimaryControlRoleLabel(['TELEPORT_GATEWAY'])).toBeNull();
    expect(getPrimaryControlRoleLabel([])).toBeNull();
  });

  it('still names each control role, in priority order', () => {
    expect(getPrimaryControlRoleLabel(['MONITORING_CSC'])).toBe('Monitoring');
    expect(getPrimaryControlRoleLabel(['TTC_STATION'])).toBe('Monitoring');
    expect(getPrimaryControlRoleLabel(['SCC_BACKUP', 'TELEPORT_GATEWAY'])).toBe('Backup SCC');
    expect(getPrimaryControlRoleLabel(['SCC_NOMINAL', 'TELEPORT_GATEWAY'])).toBe('Nominal SCC');
  });

  it('gives every real site a truthful one-line label', () => {
    for (const site of GEO_GROUND_SITES) {
      const roles = getLegacyGroundRolesForSite(site);
      const label = getGroundSiteRoleLabel(roles);
      expect(label.length).toBeGreaterThan(0);
      if (!hasControlRole(roles)) {
        expect(label).not.toMatch(/SCC|Monitoring/);
      }
    }
  });

  /*
   * The other half of the finding: a site that cumulates roles used to have
   * every role but the first silently dropped.
   */
  it('surfaces the roles a single control badge cannot show', () => {
    expect(secondaryGroundRoleLabel(['SCC_NOMINAL', 'TELEPORT_GATEWAY'])).toBe('Teleport / Gateway');
    expect(secondaryGroundRoleLabel(['SCC_NOMINAL'])).toBeNull();
    // Nothing to add beside a label that is already the full story.
    expect(secondaryGroundRoleLabel(['TELEPORT_GATEWAY'])).toBeNull();
  });

  it('finds at least one site with no control role, or this contract is untested', () => {
    const uncontrolled = GEO_GROUND_SITES.filter(
      (site) => !hasControlRole(getLegacyGroundRolesForSite(site)),
    );
    expect(uncontrolled.length).toBeGreaterThan(0);
  });
});
