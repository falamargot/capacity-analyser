import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../corsPolicy';

// SEC-2 regression: the AIS SSE route previously hardcoded
// 'Access-Control-Allow-Origin': '*' instead of using this policy.
describe('isAllowedOrigin', () => {
  it('allows http://localhost:<any port>', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
  });

  it('allows http://127.0.0.1:<any port>', () => {
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('rejects an arbitrary third-party origin', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
  });

  it('rejects a wildcard-style or malformed value', () => {
    expect(isAllowedOrigin('*')).toBe(false);
  });

  it('rejects https on localhost (only http is allowlisted, matching the dev server)', () => {
    expect(isAllowedOrigin('https://localhost:3000')).toBe(false);
  });

  it('rejects missing/undefined/null origin', () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });
});
