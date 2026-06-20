import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type {
  PDFConnectionDetails,
  PDFExportData,
  PDFEvidenceSummary,
  PDFScope,
  PerformanceData,
  LocationData,
} from '../utils/pdfExport';

interface ExportButtonProps {
  location: LocationData | null;
  scope: PDFScope;
  leoData: PerformanceData | null;
  geoData: PerformanceData | null;
  leoDetails?: PDFConnectionDetails | null;
  geoDetails?: PDFConnectionDetails | null;
  evidenceSummary?: PDFEvidenceSummary | null;
  globeRef?: React.RefObject<HTMLElement | null>;
  cesiumViewerRef?: React.RefObject<any>;
  disabled?: boolean;
}

export type ExportButtonPayload = Omit<ExportButtonProps, 'disabled'>;

const ExportButton: React.FC<ExportButtonProps> = ({
  location,
  scope,
  leoData,
  geoData,
  leoDetails,
  geoDetails,
  evidenceSummary,
  globeRef,
  cesiumViewerRef,
  disabled = false
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!location || isExporting) return;

    setIsExporting(true);
    setError(null);

    try {
      const exportData: PDFExportData = {
        location,
        scope,
        leoData,
        geoData,
        leoDetails,
        geoDetails,
        evidenceSummary,
        globeElement: globeRef?.current || null,
        cesiumViewer: cesiumViewerRef?.current
      };

      const { exportToPDF } = await import('../utils/pdfExport');
      await exportToPDF(exportData);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // Vérifier si le bouton doit être désactivé
  const isDisabled = disabled || !location || isExporting;

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={isDisabled}
        className={`
          w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
          transition-all duration-200 ease-in-out
          ${isDisabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm hover:shadow-md'
          }
        `}
        title={isDisabled 
          ? (!location ? 'Select a location first' : 'Exporting...')
          : 'Export analysis as PDF'
        }
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Exporting PDF...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Export PDF
          </>
        )}
      </button>

      {/* Message d'erreur */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Message d'information */}
      {!location && !isDisabled && (
        <div className="text-xs text-gray-500 text-center">
          Select a location on the map to enable PDF export
        </div>
      )}
    </div>
  );
};

export default ExportButton;
