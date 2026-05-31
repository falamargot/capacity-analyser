import type { ReactNode } from 'react';
import CommercialInspectorPanel from './CommercialInspectorPanel';
import CommercialKpiBar from './CommercialKpiBar';
import CommercialRouteStrip from './CommercialRouteStrip';
import type { CommercialScenarioViewModel } from './commercialViewModel';

interface CommercialModeShellProps {
  viewModel: CommercialScenarioViewModel;
  onSelectedSegmentChange: (segment: string) => void;
  onViewFullAnalysis: () => void;
  globe: ReactNode;
  isMobile?: boolean;
  isFullscreen?: boolean;
}

export default function CommercialModeShell({
  viewModel,
  onSelectedSegmentChange,
  onViewFullAnalysis,
  globe,
  isMobile = false,
  isFullscreen = false,
}: CommercialModeShellProps) {
  const selectedSegmentId = viewModel.selectedSegmentId ?? 'summary';

  if (isMobile) {
    return (
      <main className="h-[calc(100dvh-4.5rem)] bg-slate-950">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <CommercialKpiBar viewModel={viewModel} />
          <div className="relative min-h-[18rem] flex-1 overflow-hidden bg-slate-950">
            {globe}
          </div>
          {!isFullscreen && (
            <>
              <CommercialRouteStrip
                segments={viewModel.routeSegments}
                selectedSegmentId={selectedSegmentId}
                onSelectedSegmentChange={onSelectedSegmentChange}
              />
              <div className="max-h-[45vh] min-h-[18rem] overflow-hidden">
                <CommercialInspectorPanel
                  viewModel={viewModel}
                  selectedSegmentId={selectedSegmentId}
                  onSelectedSegmentChange={onSelectedSegmentChange}
                  onViewFullAnalysis={onViewFullAnalysis}
                />
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className={isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-0' : 'bg-slate-950 px-2 py-4 sm:px-3 lg:px-4'}>
      <div className={`flex min-h-0 overflow-hidden border border-slate-700 bg-slate-950 shadow-[0_32px_90px_-50px_rgba(15,23,42,0.95)] ${isFullscreen ? 'h-full rounded-none' : 'h-[calc(100vh-7rem)] rounded-xl'}`}>
        <div className="flex min-w-0 flex-1 flex-col">
          <CommercialKpiBar viewModel={viewModel} />
          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">
            {globe}
          </div>
          {!isFullscreen && (
            <CommercialRouteStrip
              segments={viewModel.routeSegments}
              selectedSegmentId={selectedSegmentId}
              onSelectedSegmentChange={onSelectedSegmentChange}
            />
          )}
        </div>
        {!isFullscreen && (
          <div className="w-[340px] shrink-0">
            <CommercialInspectorPanel
              viewModel={viewModel}
              selectedSegmentId={selectedSegmentId}
              onSelectedSegmentChange={onSelectedSegmentChange}
              onViewFullAnalysis={onViewFullAnalysis}
            />
          </div>
        )}
      </div>
    </main>
  );
}
