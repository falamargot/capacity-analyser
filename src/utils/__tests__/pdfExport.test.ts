import { describe, expect, it } from 'vitest';
import { buildDataProvenance } from '../dataProvenance';
import {
  buildPDFDocument,
  generateEngineeringVerdict,
  toPdfSafeText,
  type PDFExportData,
  type PerformanceData,
} from '../pdfExport';

const unavailableLeo: PerformanceData = {
  name: 'ONEWEB-0556',
  serviceState: 'path-unavailable',
  serviceReason: 'No complete LEO Site-to-Site path',
  rtt: 20,
  downlinkGbps: null,
  uplinkGbps: null,
  elevation: 64.1,
  stability: 'High',
  distance: 1298,
  radioPath: 'No complete path',
};

const unavailableGeo: PerformanceData = {
  name: 'EUTELSAT 21B',
  serviceState: 'blocked',
  serviceReason: 'RF margin below threshold',
  rtt: 575,
  downlinkGbps: null,
  uplinkGbps: null,
  elevation: 37.7,
  stability: 'Unstable',
  distance: 37967,
  radioPath: 'No deliverable path',
};

describe('PDF engineering truth', () => {
  it('never recommends a low-latency technology without a deliverable path', () => {
    expect(generateEngineeringVerdict(unavailableLeo, unavailableGeo)).toMatch(/^No viable recommendation:/);
  });

  it('reports the only deliverable technology without inventing a customer objective', () => {
    const deliverableGeo = { ...unavailableGeo, serviceState: 'constrained' as const, downlinkGbps: 0.02 };
    expect(generateEngineeringVerdict(unavailableLeo, deliverableGeo)).toBe(
      'GEO is the only technology with a confirmed deliverable path in this analysis.',
    );
  });
});

describe('PDF text safety', () => {
  it('transliterates Serbian Cyrillic instead of emitting mojibake', () => {
    expect(toPdfSafeText('Нови Београд, Србија')).toBe('Novi Beograd, Srbija');
    expect(toPdfSafeText('Published · 21 Jul 2026')).toBe('Published / 21 Jul 2026');
  });
});

describe('PDF pagination', () => {
  it('puts evidence and provenance on dedicated pages with consistent footers', async () => {
    const generatedAt = new Date('2026-07-22T20:27:30.000Z');
    const data: PDFExportData = {
      location: { lat: 45.4, lng: 19.94, name: 'Нови Београд, Србија' },
      scope: 'ALL',
      leoData: unavailableLeo,
      geoData: unavailableGeo,
      leoDetails: { radioPath: 'No complete LEO path', emptyState: 'Unavailable' },
      geoDetails: { radioPath: 'No deliverable GEO path', emptyState: 'Unavailable' },
      evidenceSummary: {
        architectureChoice: 'GEO feasibility path',
        limitingFactor: 'RF margin below threshold',
        expectedPerformance: 'No deliverable performance',
        confidence: 'Low',
        confidenceReasons: ['Path: unavailable', 'RF: blocked'],
        availabilityContext: 'Indicative only; not an SLA',
      },
      dataProvenance: buildDataProvenance({ architecture: 'GEO', generatedAt }),
      simulationTime: '2026-08-04T13:49:31.000Z',
      simulationMode: 'simulation',
      simulationSpeed: -5,
      globeElement: null,
    };

    const pdf = await buildPDFDocument(data);
    const pages = (pdf.internal as unknown as { pages: string[][] }).pages;
    const pageText = pages.map((commands) => commands?.join('\n') ?? '');

    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    expect(pageText[1]).toContain('ENGINEERING VERDICT');
    expect(pageText[1]).not.toContain('RECOMMENDATION');
    expect(pageText.some((page) => page.includes('DECISION EVIDENCE'))).toBe(true);
    expect(pageText.some((page) => page.includes('DATA PROVENANCE'))).toBe(true);
    expect(pageText.every((page, index) => index === 0 || page.includes('SIMULATION / 2026-08-04T13:49:31.000Z / -5x'))).toBe(true);
    expect(pageText.every((page, index) => index === 0 || page.includes(`Page ${index}/${pdf.getNumberOfPages()}`))).toBe(true);
  });
});
