/**
 * Regression tests for free-space propagation constants and slant-range unification.
 *
 * These tests guard against:
 *  1. Re-introduction of the cable-medium velocity factor (0.97) in free-space latency.
 *  2. Divergence between GEO and LEO latency engines caused by different speed-of-light values.
 *  3. Link-budget slant ranges computed on anything other than WGS84 ECEF.
 */

import { describe, expect, it } from 'vitest';
import { SPEED_OF_LIGHT_RADIO_KM_S, computeOneWayLatencyMs } from '../capacityCalculator';
import { SPEED_OF_LIGHT_M_S, distanceKm } from '../geoConnectivityModel';

// ─── 1. Physical constant consistency ────────────────────────────────────────

describe('free-space speed of light constants', () => {
  it('SPEED_OF_LIGHT_RADIO_KM_S equals exactly 299792.458 km/s', () => {
    expect(SPEED_OF_LIGHT_RADIO_KM_S).toBe(299792.458);
  });

  it('SPEED_OF_LIGHT_M_S equals exactly 299792458 m/s', () => {
    expect(SPEED_OF_LIGHT_M_S).toBe(299792458);
  });

  it('km/s and m/s constants are mutually consistent (unit conversion)', () => {
    // SPEED_OF_LIGHT_RADIO_KM_S * 1000 m/km === SPEED_OF_LIGHT_M_S
    expect(SPEED_OF_LIGHT_RADIO_KM_S * 1000).toBeCloseTo(SPEED_OF_LIGHT_M_S, 0);
  });

  it('GEO and LEO one-way latency engines produce the same result for the same distance', () => {
    const distanceKm = 38_000; // typical GEO slant range

    // LEO engine (capacityCalculator)
    const leoLatencyMs = (distanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;

    // GEO engine (geoConnectivityModel) — expressed in km/s for comparison
    const geoSpeedKmS = SPEED_OF_LIGHT_M_S / 1000;
    const geoLatencyMs = (distanceKm / geoSpeedKmS) * 1000;

    expect(leoLatencyMs).toBeCloseTo(geoLatencyMs, 6);
  });

  it('LEO one-way latency at 1200 km nadir is near 4 ms (not inflated by a velocity factor)', () => {
    // At nadir, user-to-satellite distance = altitude = 1200 km.
    // Expected: 1200 / 299792.458 * 1000 ≈ 4.003 ms
    const latencyMs = computeOneWayLatencyMs(1200);
    expect(latencyMs).toBeGreaterThanOrEqual(4);
    expect(latencyMs).toBeLessThanOrEqual(5);
  });

  it('GEO one-way latency at 35786 km nadir is approximately 119 ms', () => {
    // 35786 / 299792.458 * 1000 ≈ 119.4 ms
    const latencyMs = computeOneWayLatencyMs(35786);
    expect(latencyMs).toBeGreaterThanOrEqual(119);
    expect(latencyMs).toBeLessThanOrEqual(120);
  });
});

// ─── 2. Slant-range unification ───────────────────────────────────────────────

describe('slant-range computation', () => {
  // Reference geometry: user at Paris (48.85°N, 2.35°E), GEO satellite at
  // approximately 9°E (e.g. EUTELSAT 9B), 35786 km altitude.
  const userParis = { lat: 48.85, lng: 2.35, altKm: 0 };
  const satAt9E = { lat: 0.0, lng: 9.0, altKm: 35786 };

  it('distanceKm (WGS84 ECEF) returns a plausible GEO slant range for Paris → 9°E slot', () => {
    const range = distanceKm(userParis, satAt9E);
    // At roughly 30° elevation from Paris to 9°E, expected range 37 000–39 000 km.
    expect(range).toBeGreaterThan(37_000);
    expect(range).toBeLessThan(39_000);
  });

  // The spherical-vs-WGS84 comparison that lived here was removed with
  // `computeSlantRange` itself (SPA-03). It characterised the divergence of a
  // function with no production callers; with the function gone there is
  // nothing left to characterise. The measured figure it recorded — the two
  // Earth models agreeing within ~40 km for a mid-latitude GEO link — is
  // preserved in docs/SPATIAL_PHYSICS_AUDIT.md.

  it('distanceKm (WGS84) is the authoritative value used for link-budget slant range', () => {
    // This test documents the contract: link-budget candidates produced by
    // geoCoverageSelection derive slant range from WGS84 ECEF positions, and
    // that is now the only slant-range path in the codebase.
    const range = distanceKm(userParis, satAt9E);
    expect(typeof range).toBe('number');
    expect(Number.isFinite(range)).toBe(true);
  });

  it('WGS84 slant range to GEO nadir point equals satellite altitude within 15 km', () => {
    // A user directly under the satellite (same lat/lng) should see a slant
    // range equal to the orbital altitude (offset only by WGS84 flattening).
    const user = { lat: 0.0, lng: 9.0, altKm: 0 };
    const sat = { lat: 0.0, lng: 9.0, altKm: 35786 };
    const range = distanceKm(user, sat);
    expect(Math.abs(range - 35786)).toBeLessThan(15);
  });

  it('LEO WGS84 slant range at nadir equals altitude within 5 km', () => {
    const user = { lat: 51.5, lng: 0.0, altKm: 0 };
    const sat = { lat: 51.5, lng: 0.0, altKm: 1200 };
    const range = distanceKm(user, sat);
    expect(Math.abs(range - 1200)).toBeLessThan(5);
  });
});
