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
import type { DataProvenanceModel } from '../utils/dataProvenance';

interface ExportButtonProps {
  location: LocationData | null;
  scope: PDFScope;
  leoData: PerformanceData | null;
  geoData: PerformanceData | null;
  leoDetails?: PDFConnectionDetails | null;
  geoDetails?: PDFConnectionDetails | null;
  evidenceSummary?: PDFEvidenceSummary | null;
  dataProvenance?: DataProvenanceModel | null;
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
  dataProvenance,
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
        dataProvenance,
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
    <div className="space-y-1.5">
      <button
        onClick={handleExport}
        disabled={isDisabled}
        className={`
          flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium
          bg-white/90 backdrop-blur-sm dark:bg-slate-900/90
          transition-colors duration-150
          ${isDisabled
            ? 'border-gray-200 text-gray-400 cursor-not-allowed dark:border-slate-700 dark:text-slate-600'
            : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
          }
        `}
        title={isDisabled
          ? (!location ? 'Select a location first' : 'Exporting...')
          : 'Export analysis as PDF'
        }
      >
        {isExporting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Exporting PDF...
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
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
