import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { dataProvenanceRows, type DataProvenanceModel } from './dataProvenance';
import type { EngineeringServiceState } from './engineeringAnalysisViewModel';

// Types pour les données de performance
export interface PerformanceData {
  name: string;
  serviceState: EngineeringServiceState;
  serviceReason?: string;
  rtt: number | null;
  downlinkGbps: number | null;
  uplinkGbps: number | null;
  elevation: number | null;
  stability: string;
  distance: number | null;
  radioPath: string;
}

export interface LocationData {
  lat: number;
  lng: number;
  name?: string;
}

export type PDFScope = 'ALL' | 'LEO' | 'GEO';

export interface PDFMetricRow {
  label: string;
  value: string;
}

export interface PDFLatencyDetails {
  summary?: string;
  propagationRows: PDFMetricRow[];
  propagationTotal?: string;
  overheadRows: PDFMetricRow[];
  overheadTotal?: string;
  total?: string;
  warnings?: string[];
}

export interface PDFPerformanceDetails {
  rttLabel: string;
  rttMs: number | null;
  downlinkGbps: number | null;
  uplinkGbps: number | null;
  maxDlGbps: number;
  maxUlGbps: number;
  stability?: string | null;
  performanceFactor?: number | null;
  notes?: string[];
}

export interface PDFConnectionDetails {
  radioPath: string;
  routeLines?: string[];
  oneWayPropagation?: {
    distanceKm: number | null;
    latencyMs: number | null;
  };
  latency?: PDFLatencyDetails | null;
  performance?: PDFPerformanceDetails | null;
  emptyState?: string;
}

export interface PDFEvidenceSummary {
  architectureChoice: string;
  limitingFactor: string;
  expectedPerformance: string;
  confidence: string;
  confidenceReasons: string[];
  availabilityContext?: string;
}

interface CesiumViewerLike {
  render?: () => void;
  scene?: {
    canvas?: HTMLCanvasElement | null;
  };
}

interface SnapshotImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface PDFExportData {
  location: LocationData;
  scope: PDFScope;
  leoData: PerformanceData | null;
  geoData: PerformanceData | null;
  leoDetails?: PDFConnectionDetails | null;
  geoDetails?: PDFConnectionDetails | null;
  evidenceSummary?: PDFEvidenceSummary | null;
  dataProvenance?: DataProvenanceModel | null;
  globeElement: HTMLElement | null;
  cesiumViewer?: CesiumViewerLike | null;
}

// Fonction pour générer le nom du fichier
export function generateFileName(location: LocationData): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `Capacity_Analysis_${location.lat.toFixed(2)}_${location.lng.toFixed(2)}_${timestamp}.pdf`;
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Dj', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z', И: 'I', Й: 'Y',
  Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', Ћ: 'C',
  У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Џ: 'Dz', Ш: 'Sh', Щ: 'Shch', Ъ: '', Ы: 'Y', Ь: '',
  Э: 'E', Ю: 'Yu', Я: 'Ya', Є: 'Ye', І: 'I', Ї: 'Yi', Ґ: 'G',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', џ: 'dz', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', є: 'ye', і: 'i', ї: 'yi', ґ: 'g',
};

export function toPdfSafeText(value: string): string {
  const transliterated = Array.from(value.normalize('NFKD'))
    .filter((character) => !/[\u0300-\u036f]/.test(character))
    .map((character) => CYRILLIC_TO_LATIN[character] ?? character)
    .join('');
  return transliterated
    .replaceAll('→', ' -> ')
    .replaceAll('←', ' <- ')
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('·', ' / ')
    .replaceAll('’', "'")
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replace(/[^\x20-\x7E°]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fonction pour formater les valeurs
function formatValue(value: number | null | undefined, unit: string = '', precision: number = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  
  // Gérer la précision selon le type de valeur
  let formattedValue: string;
  if (unit.includes('°')) {
    // Pour l'élévation, 1 décimale
    formattedValue = value.toFixed(1);
  } else if (unit.includes('ms')) {
    // Pour la latence, entier
    formattedValue = value.toFixed(0);
  } else if (unit.includes('km')) {
    // Pour la distance, entier
    formattedValue = value.toFixed(0);
  } else if (unit.includes('Mbps') || unit.includes('Gbps')) {
    // Pour les débits, entier
    formattedValue = value.toFixed(0);
  } else {
    // Pour les autres valeurs, utiliser la précision par défaut
    formattedValue = value.toFixed(precision);
  }
  
  return `${formattedValue}${unit}`;
}

function formatLocationLabel(location: LocationData): string {
  const coordinates = `${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}`;
  return toPdfSafeText(location.name ? `${coordinates} (${location.name})` : coordinates);
}

function formatScopeLabel(scope: PDFScope): string {
  if (scope === 'ALL') return 'ALL';
  return scope;
}

function addFooters(pdf: jsPDF, generatedAt: Date): void {
  const pageCount = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pdf.setPage(pageNumber);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.text('Capacity Analyzer - Theoretical Analysis Only - Not for Contractual Use', 105, 280, { align: 'center' });
    pdf.text(`Generated: ${format(generatedAt, 'PPpp')} · Page ${pageNumber}/${pageCount}`, 105, 285, { align: 'center' });
  }
}

function formatThroughput(gbps: number | null | undefined): string {
  if (gbps == null || !Number.isFinite(gbps)) return 'N/A';
  if (gbps >= 1) return `${gbps.toFixed(1)} Gbps`;
  return `${Math.round(gbps * 1000)} Mbps`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${Math.round(value * 100)}%`;
}

function drawTable(
  pdf: jsPDF,
  headers: string[],
  rows: string[][],
  startY: number
): number {
  const tableX = 20;
  const colWidths = headers.length === 2 ? [54, 116] : [44, 63, 63];
  const lineHeight = 4.5;
  const cellPaddingX = 2.5;
  const cellPaddingY = 2.5;
  let currentY = startY;

  const drawRow = (cells: string[], isHeader: boolean) => {
    pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
    pdf.setFontSize(isHeader ? 11 : 9);

    const splitCells = cells.map((cell, index) =>
      pdf.splitTextToSize(toPdfSafeText(cell), colWidths[index] - cellPaddingX * 2)
    );
    const contentHeight = Math.max(...splitCells.map((lines) => lines.length * lineHeight));
    const rowHeight = Math.max(isHeader ? 10 : 9, contentHeight + cellPaddingY * 2);

    let cellX = tableX;
    splitCells.forEach((lines, index) => {
      if (isHeader) {
        pdf.setFillColor(241, 245, 249);
        pdf.rect(cellX, currentY, colWidths[index], rowHeight, 'FD');
      } else {
        pdf.rect(cellX, currentY, colWidths[index], rowHeight);
      }

      pdf.text(lines, cellX + cellPaddingX, currentY + cellPaddingY + lineHeight - 1);
      cellX += colWidths[index];
    });

    currentY += rowHeight;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row, false));

  return currentY;
}

function getSnapshotCanvas(data: PDFExportData): HTMLCanvasElement | null {
  const viewerCanvas = data.cesiumViewer?.scene?.canvas;
  if (typeof HTMLCanvasElement !== 'undefined' && viewerCanvas instanceof HTMLCanvasElement) {
    return viewerCanvas;
  }

  const domCanvas = data.globeElement?.querySelector('canvas');
  return typeof HTMLCanvasElement !== 'undefined' && domCanvas instanceof HTMLCanvasElement ? domCanvas : null;
}

async function captureGlobeSnapshot(data: PDFExportData): Promise<SnapshotImage | null> {
  const canvas = getSnapshotCanvas(data);
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  try {
    data.cesiumViewer?.render?.();
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  } catch (error) {
    console.warn('Unable to capture globe snapshot for PDF export:', error);
    return null;
  }
}

const DELIVERABLE_STATES: ReadonlySet<EngineeringServiceState> = new Set(['available', 'constrained', 'degraded']);

export function hasDeliverablePdfPath(data: PerformanceData | null | undefined): data is PerformanceData {
  if (!data || !DELIVERABLE_STATES.has(data.serviceState)) return false;
  return (data.downlinkGbps ?? 0) > 0 || (data.uplinkGbps ?? 0) > 0;
}

function serviceStateLabel(data: PerformanceData | null): string {
  if (!data) return 'Not evaluated';
  const labels: Record<EngineeringServiceState, string> = {
    available: 'Available',
    constrained: 'Constrained',
    degraded: 'Degraded',
    blocked: 'Blocked',
    incomplete: 'Incomplete',
    'path-unavailable': 'Path unavailable',
    'budget-unavailable': 'Budget unavailable',
    uncertain: 'Uncertain',
  };
  return labels[data.serviceState];
}

export function generateEngineeringVerdict(
  leoData: PerformanceData | null,
  geoData: PerformanceData | null,
  scope: PDFScope = 'ALL',
): string {
  const leoViable = scope !== 'GEO' && hasDeliverablePdfPath(leoData);
  const geoViable = scope !== 'LEO' && hasDeliverablePdfPath(geoData);
  if (!leoViable && !geoViable) {
    return 'No viable recommendation: no technology has a confirmed deliverable path for this scenario.';
  }
  if (leoViable && !geoViable) {
    return 'LEO is the only technology with a confirmed deliverable path in this analysis.';
  }
  if (geoViable && !leoViable) {
    return 'GEO is the only technology with a confirmed deliverable path in this analysis.';
  }
  return 'Both LEO and GEO have deliverable paths. No customer objective is selected; compare latency, throughput, availability, and resilience before choosing.';
}

function comparisonMetric(
  data: PerformanceData | null,
  value: number | null | undefined,
  formatter: (metric: number) => string,
): string {
  if (!hasDeliverablePdfPath(data) || value == null || !Number.isFinite(value)) return 'N/A';
  return formatter(value);
}

function drawReportContext(pdf: jsPDF, title: string, data: PDFExportData): void {
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, 20, 20);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Location: ${formatLocationLabel(data.location)}`, 20, 30);
  pdf.text(`Scope filter: ${formatScopeLabel(data.scope)}`, 20, 36);
}

function createComparisonPage(pdf: jsPDF, data: PDFExportData, snapshot: SnapshotImage | null, generatedAt: Date): void {
  const { location, leoData, geoData } = data;
  
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EUTELSAT CAPACITY ANALYSIS', 105, 20, { align: 'center' });
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated: ${format(generatedAt, 'PPpp')}`, 105, 30, { align: 'center' });
  pdf.text(`Location: ${formatLocationLabel(location)}`, 105, 37, { align: 'center' });
  pdf.text(`Scope filter: ${formatScopeLabel(data.scope)}`, 105, 43, { align: 'center' });

  let currentY = 54;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SCENE SNAPSHOT', 20, currentY);

  currentY += 4;
  if (snapshot) {
    const maxWidth = 170;
    const maxHeight = 88;
    const scale = Math.min(maxWidth / snapshot.width, maxHeight / snapshot.height);
    const renderWidth = snapshot.width * scale;
    const renderHeight = snapshot.height * scale;
    const imageX = 20 + (maxWidth - renderWidth) / 2;
    const imageY = currentY + (maxHeight - renderHeight) / 2;

    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(20, currentY, maxWidth, maxHeight, 3, 3);
    pdf.addImage(snapshot.dataUrl, 'PNG', imageX, imageY, renderWidth, renderHeight, undefined, 'FAST');
  } else {
    pdf.setDrawColor(203, 213, 225);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, currentY, 170, 88, 3, 3, 'FD');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 116, 139);
    pdf.text(toPdfSafeText('Snapshot unavailable for this export.'), 105, currentY + 46, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  currentY += 100;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('COMPARISON SUMMARY', 20, currentY);

  currentY += 5;
  const tableHeaders = ['Metric', 'LEO (OneWeb)', 'GEO (Eutelsat)'];
  const tableData = [
    ['Service state', serviceStateLabel(leoData), serviceStateLabel(geoData)],
    ['Satellite', leoData?.name || 'N/A', geoData?.name || 'N/A'],
    ['Latency', comparisonMetric(leoData, leoData?.rtt, (value) => `${Math.round(value)} ms`), comparisonMetric(geoData, geoData?.rtt, (value) => `${Math.round(value)} ms`)],
    ['Downlink', comparisonMetric(leoData, leoData?.downlinkGbps, formatThroughput), comparisonMetric(geoData, geoData?.downlinkGbps, formatThroughput)],
    ['Uplink', comparisonMetric(leoData, leoData?.uplinkGbps, formatThroughput), comparisonMetric(geoData, geoData?.uplinkGbps, formatThroughput)],
    ['Elevation', comparisonMetric(leoData, leoData?.elevation, (value) => `${value.toFixed(1)}°`), comparisonMetric(geoData, geoData?.elevation, (value) => `${value.toFixed(1)}°`)],
    ['Stability', hasDeliverablePdfPath(leoData) ? leoData.stability : 'N/A', hasDeliverablePdfPath(geoData) ? geoData.stability : 'N/A'],
    ['Distance', comparisonMetric(leoData, leoData?.distance, (value) => `${Math.round(value)} km`), comparisonMetric(geoData, geoData?.distance, (value) => `${Math.round(value)} km`)],
  ];

  currentY = drawTable(pdf, tableHeaders, tableData, currentY);

  currentY += 7;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ENGINEERING VERDICT:', 20, currentY);
  
  currentY += 7;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const verdict = generateEngineeringVerdict(leoData, geoData, data.scope);
  const lines = pdf.splitTextToSize(toPdfSafeText(verdict), 170);
  lines.forEach((line: string) => {
    pdf.text(line, 20, currentY);
    currentY += 5;
  });

}

function createEvidencePage(pdf: jsPDF, data: PDFExportData): void {
  if (!data.evidenceSummary) return;
  pdf.addPage();
  drawReportContext(pdf, 'DECISION EVIDENCE', data);
  const evidenceRows = [
    ['Architecture focus', data.evidenceSummary.architectureChoice],
    ['Main limiting factor', data.evidenceSummary.limitingFactor],
    ['Expected performance', data.evidenceSummary.expectedPerformance],
    ['Prediction confidence', data.evidenceSummary.confidence],
    ['Indicative weather availability', data.evidenceSummary.availabilityContext ?? 'N/A'],
  ];
  let currentY = drawTable(pdf, ['Evidence', 'Value'], evidenceRows, 48);
  if (data.evidenceSummary.confidenceReasons.length) {
    currentY += 8;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CONFIDENCE BASIS', 20, currentY);
    currentY += 7;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const reasonText = data.evidenceSummary.confidenceReasons.join(' | ');
    const reasonLines = pdf.splitTextToSize(toPdfSafeText(reasonText), 170);
    pdf.text(reasonLines, 20, currentY);
  }
}

function createProvenancePage(pdf: jsPDF, data: PDFExportData): void {
  if (!data.dataProvenance) return;
  pdf.addPage();
  drawReportContext(pdf, 'DATA PROVENANCE', data);
  const provenanceRows = dataProvenanceRows(data.dataProvenance).map((row) => [
    row.label,
    row.note ? `${row.source} (${row.note})` : row.source,
    `${row.nature} · ${row.asOf}`,
  ]);
  drawTable(pdf, ['Data', 'Source', 'Nature · as of'], provenanceRows, 48);
}

function createDetailsPage(pdf: jsPDF, data: PDFExportData): void {
  pdf.addPage();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const bottomLimit = pageHeight - 24;
  const topStartY = 42;
  let currentY = topStartY;

  const drawHeader = (continuation = false) => {
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(continuation ? 'ANALYSIS DETAILS (CONT.)' : 'ANALYSIS DETAILS', 20, 20);

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Location: ${formatLocationLabel(data.location)}`, 20, 30);
    pdf.text(`Scope filter: ${formatScopeLabel(data.scope)}`, 20, 36);
    currentY = topStartY;
  };

  const startNewPage = () => {
    pdf.addPage();
    drawHeader(true);
  };

  const ensureSpace = (heightNeeded: number) => {
    if (currentY + heightNeeded <= bottomLimit) return;
    startNewPage();
  };

  const writeWrappedText = (text: string, x: number, width: number, fontSize = 9, lineHeight = 4.5) => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(toPdfSafeText(text), width);
    pdf.text(lines, x, currentY);
    currentY += lines.length * lineHeight;
  };

  const writeSubheading = (title: string) => {
    ensureSpace(9);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(toPdfSafeText(title), 20, currentY);
    currentY += 6;
  };

  const writeMetricRows = (rows: PDFMetricRow[], emphasizeLast = false) => {
    rows.forEach((row, index) => {
      ensureSpace(6);
      const isEmphasized = emphasizeLast && index === rows.length - 1;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', isEmphasized ? 'bold' : 'normal');
      pdf.text(toPdfSafeText(row.label), 24, currentY);
      pdf.text(toPdfSafeText(row.value), 190, currentY, { align: 'right' });
      currentY += 5;
    });
  };

  const writeParagraphBlock = (title: string, body: string) => {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(toPdfSafeText(body), 166);
    ensureSpace(9 + lines.length * 4.5 + 4);
    writeSubheading(title);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(lines, 24, currentY);
    currentY += lines.length * 4.5;
    currentY += 4;
  };

  const writeRouteLines = (lines: string[]) => {
    lines.forEach((line) => {
      ensureSpace(6);
      writeWrappedText(line, 24, 166);
    });
    currentY += 2;
  };

  const renderConnectionDetails = (title: string, details: PDFConnectionDetails | null | undefined, fallback: string) => {
    ensureSpace(12);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(toPdfSafeText(title), 20, currentY);
    currentY += 8;

    if (!details) {
      writeWrappedText(fallback, 24, 166);
      currentY += 6;
      return;
    }

    writeParagraphBlock('Radio path', details.radioPath || details.emptyState || fallback);

    if (details.routeLines?.length) {
      writeSubheading('Path details');
      writeRouteLines(details.routeLines);
    }

    if (details.oneWayPropagation) {
      writeSubheading('One-way propagation');
      const propagationValue = details.oneWayPropagation.distanceKm != null && details.oneWayPropagation.latencyMs != null
        ? `${details.oneWayPropagation.distanceKm.toFixed(0)} km (${details.oneWayPropagation.latencyMs.toFixed(1)} ms)`
        : 'N/A';
      writeMetricRows([{ label: 'Signal path', value: propagationValue }]);
      currentY += 3;
    }

    if (details.latency) {
      writeSubheading('Latency breakdown');
      if (details.latency.summary) {
        writeWrappedText(details.latency.summary, 24, 166);
        currentY += 3;
      }

      if (details.latency.propagationRows.length) {
        ensureSpace(7);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text('RTT propagation components', 24, currentY);
        currentY += 5;
        writeMetricRows(details.latency.propagationRows);
      }

      if (details.latency.propagationTotal) {
        writeMetricRows([{ label: 'RTT propagation', value: details.latency.propagationTotal }], true);
      }

      if (details.latency.overheadRows.length) {
        ensureSpace(7);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Network overhead components', 24, currentY);
        currentY += 5;
        writeMetricRows(details.latency.overheadRows);
      }

      if (details.latency.overheadTotal) {
        writeMetricRows([{ label: 'Network overhead total', value: details.latency.overheadTotal }], true);
      }

      if (details.latency.total) {
        writeMetricRows([{ label: 'Estimated RTT total', value: details.latency.total }], true);
      }

      if (details.latency.warnings?.length) {
        writeSubheading('Warnings');
        details.latency.warnings.forEach((warning) => {
          writeWrappedText(`Warning: ${warning}`, 24, 166);
        });
        currentY += 2;
      }
    }

    if (details.performance) {
      writeSubheading('Estimated performance');
      const performanceRows: PDFMetricRow[] = [
        { label: details.performance.rttLabel, value: details.performance.rttMs != null ? `${Math.round(details.performance.rttMs)} ms` : 'N/A' },
        { label: 'Downlink throughput', value: formatThroughput(details.performance.downlinkGbps) },
        { label: 'Uplink throughput', value: formatThroughput(details.performance.uplinkGbps) },
        { label: 'Stability', value: details.performance.stability || 'N/A' },
        { label: 'Terminal max downlink', value: formatThroughput(details.performance.maxDlGbps) },
        { label: 'Terminal max uplink', value: formatThroughput(details.performance.maxUlGbps) },
      ];

      if (details.performance.performanceFactor != null) {
        performanceRows.push({ label: 'Effective performance factor', value: formatPercent(details.performance.performanceFactor) });
      }

      writeMetricRows(performanceRows);

      if (details.performance.notes?.length) {
        currentY += 1;
        details.performance.notes.forEach((note) => {
          writeWrappedText(note, 24, 166);
        });
      }
    }

    currentY += 6;
  };

  drawHeader(false);

  if (data.scope !== 'GEO') {
    renderConnectionDetails(
      'LEO CONNECTIVITY',
      data.leoDetails,
      'No LEO route was available for the selected analysis point.'
    );
  }

  if (data.scope !== 'LEO') {
    renderConnectionDetails(
      'GEO CONNECTIVITY',
      data.geoDetails,
      'No GEO route was available for the selected analysis point.'
    );
  }

  writeParagraphBlock(
    'Export notes',
    'Values in this report reflect the current simulated analysis state shown in the application at export time. Throughput, latency, elevation, and stability are theoretical indicators and should not be treated as contractual service guarantees.'
  );
}

export async function buildPDFDocument(data: PDFExportData): Promise<jsPDF> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const snapshot = await captureGlobeSnapshot(data);
  const generatedAtValue = data.dataProvenance?.generatedAt ?? new Date().toISOString();
  const parsedGeneratedAt = new Date(generatedAtValue);
  const generatedAt = Number.isNaN(parsedGeneratedAt.getTime()) ? new Date() : parsedGeneratedAt;

  createComparisonPage(pdf, data, snapshot, generatedAt);
  createEvidencePage(pdf, data);
  createProvenancePage(pdf, data);
  createDetailsPage(pdf, data);
  addFooters(pdf, generatedAt);
  return pdf;
}

// Fonction principale d'export PDF
export async function exportToPDF(data: PDFExportData): Promise<void> {
  try {
    const pdf = await buildPDFDocument(data);
    pdf.save(generateFileName(data.location));
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}
