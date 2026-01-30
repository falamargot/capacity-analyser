import jsPDF from 'jspdf';
import { format } from 'date-fns';

// Types pour les données de performance
export interface PerformanceData {
  name: string;
  rtt: number | null;
  downlinkGbps: number;
  uplinkGbps: number;
  elevation: number;
  stability: string;
  distance: number;
  radioPath: string;
}

export interface LocationData {
  lat: number;
  lng: number;
  name?: string;
}

export interface PDFExportData {
  location: LocationData;
  leoData: PerformanceData | null;
  geoData: PerformanceData | null;
  globeElement: HTMLElement | null;
  cesiumViewer?: any; // Ajouter le viewer Cesium
}

// Fonction pour générer le nom du fichier
export function generateFileName(location: LocationData): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `Capacity_Analysis_${location.lat.toFixed(2)}_${location.lng.toFixed(2)}_${timestamp}.pdf`;
}

// Fonction pour formater les valeurs
function formatValue(value: number | null | undefined, unit: string = '', precision: number = 2): string {
  if (value === null || value === undefined || value === 0) return 'N/A';
  
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

// Fonction pour calculer la recommandation
function generateRecommendation(leoData: PerformanceData | null, geoData: PerformanceData | null): string {
  if (!leoData && !geoData) return 'No data available for recommendation';
  
  if (leoData && geoData) {
    if (leoData.rtt && leoData.rtt < 50) {
      return 'Best for: Real-time applications (gaming, trading, IoT)';
    } else if (geoData.downlinkGbps > leoData.downlinkGbps) {
      return 'Best for: High-bandwidth applications (video, broadcast)';
    }
  }
  
  if (leoData && leoData.rtt && leoData.rtt < 50) {
    return 'Best for: Real-time applications (gaming, trading, IoT)';
  }
  
  if (geoData && geoData.downlinkGbps > 0.1) {
    return 'Best for: High-bandwidth applications (video, broadcast)';
  }
  
  return 'Analysis complete - Choose based on your specific requirements';
}

// Page 1: Tableau de comparaison
function createComparisonPage(pdf: jsPDF, data: PDFExportData): void {
  const { location, leoData, geoData } = data;
  
  // En-tête
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EUTELSAT CAPACITY ANALYSIS', 105, 20, { align: 'center' });
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated: ${format(new Date(), 'PPpp')}`, 105, 30, { align: 'center' });
  pdf.text(`Location: ${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}${location.name ? ` (${location.name})` : ''}`, 105, 37, { align: 'center' });
  
  // Tableau de comparaison
  const tableY = 50;
  const tableHeaders = ['Metric', 'LEO (OneWeb)', 'GEO (Eutelsat)'];
  const tableData = [
    ['Satellite', leoData?.name || 'N/A', geoData?.name || 'N/A'],
    ['Latency', formatValue(leoData?.rtt, ' ms'), formatValue(geoData?.rtt, ' ms')],
    ['Downlink', formatValue(leoData?.downlinkGbps * 1000, ' Mbps'), formatValue(geoData?.downlinkGbps * 1000, ' Mbps')],
    ['Uplink', formatValue(leoData?.uplinkGbps * 1000, ' Mbps'), formatValue(geoData?.uplinkGbps * 1000, ' Mbps')],
    ['Elevation', formatValue(leoData?.elevation, '°'), formatValue(geoData?.elevation, '°')],
    ['Stability', leoData?.stability || 'N/A', geoData?.stability || 'N/A'],
    ['Distance', formatValue(leoData?.distance, ' km'), formatValue(geoData?.distance, ' km')]
  ];
  
  // Dessiner le tableau
  const colWidths = [50, 60, 60];
  const rowHeight = 8;
  let currentY = tableY;
  
  // En-têtes du tableau
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  tableHeaders.forEach((header, i) => {
    pdf.text(header, 20 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY);
  });
  
  // Ligne de séparation
  pdf.line(20, currentY + 3, 170, currentY + 3);
  currentY += 8;
  
  // Données du tableau
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  tableData.forEach(row => {
    row.forEach((cell, i) => {
      pdf.text(cell, 20 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY);
    });
    currentY += rowHeight;
  });
  
  // Recommandation
  currentY += 10;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RECOMMENDATION:', 20, currentY);
  
  currentY += 7;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const recommendation = generateRecommendation(leoData, geoData);
  const lines = pdf.splitTextToSize(recommendation, 150);
  lines.forEach((line: string) => {
    pdf.text(line, 20, currentY);
    currentY += 5;
  });
  
  // Détails techniques
  currentY += 10;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TECHNICAL DETAILS:', 20, currentY);
  
  currentY += 8;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  
  if (leoData) {
    pdf.text(`LEO Radio Path: ${leoData.radioPath}`, 20, currentY);
    currentY += 6;
  }
  
  if (geoData) {
    pdf.text(`GEO Radio Path: ${geoData.radioPath}`, 20, currentY);
    currentY += 6;
  }
  
  // Ajouter un peu d'espace avant le footer
  currentY += 5;
  
  // Footer
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.text('Capacity Analyzer - Theoretical Analysis Only - Not for Contractual Use', 105, 280, { align: 'center' });
  pdf.text(`Generated: ${format(new Date(), 'PPpp')}`, 105, 285, { align: 'center' });
}

// Fonction principale d'export PDF
export async function exportToPDF(data: PDFExportData): Promise<void> {
  try {
    // Créer le PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Créer la page de résumé (seule page)
    createComparisonPage(pdf, data);
  
    // Footer
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.text('Capacity Analyzer - Theoretical Analysis Only - Not for Contractual Use', 105, 280, { align: 'center' });
    pdf.text(`Generated: ${format(new Date(), 'PPpp')}`, 105, 285, { align: 'center' });
  
    // Sauvegarder le PDF
    const fileName = generateFileName(data.location);
    pdf.save(fileName);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}
