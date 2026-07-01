import { describe, expect, it } from 'vitest';
import { GEO_GATEWAYS, getGatewayTrafficStatusNote, type GatewayTrafficStatus } from '../GlobeConfig';

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
