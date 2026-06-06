import type { ReactNode } from 'react';
import CommercialKpiBar from './CommercialKpiBar';
import CommercialNarrativeCard from './CommercialNarrativeCard';
import CommercialRouteStrip from './CommercialRouteStrip';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import type { CommercialRouteModel } from '../../types/commercialRouteModel';

interface CommercialModeShellProps {
  viewModel: CommercialScenarioViewModel;
  commercialRouteModel?: CommercialRouteModel;
  onSelectedSegmentChange: (segment: string) => void;
  onViewFullAnalysis: () => void;
  globe: ReactNode;
  isMobile?: boolean;
  isFullscreen?: boolean;
}

export default function CommercialModeShell({
  viewModel,
  commercialRouteModel,
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
                commercialRouteModel={commercialRouteModel}
                onSelectedSegmentChange={onSelectedSegmentChange}
              />
              <div className="max-h-[45vh] min-h-[16rem] overflow-hidden">
                <CommercialNarrativeCard
                  viewModel={viewModel}
                  selectedSegmentId={selectedSegmentId}
                  commercialRouteModel={commercialRouteModel}
                  onViewFullAnalysis={onViewFullAnalysis}
                  compact
                />
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  // Desktop: the new layout renders the globe + overlays directly in App.tsx.
  // CommercialModeShell is only used for mobile — this branch is unreachable on desktop.
  return (
    <main className="bg-slate-950 px-2 py-4 sm:px-3 lg:px-4">
      <div className="flex h-[calc(100vh-7rem)] min-h-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
        <div className="flex min-w-0 flex-1 flex-col">
          <CommercialKpiBar viewModel={viewModel} />
          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">
            {globe}
          </div>
          {!isFullscreen && (
            <CommercialRouteStrip
              segments={viewModel.routeSegments}
              selectedSegmentId={selectedSegmentId}
              commercialRouteModel={commercialRouteModel}
              onSelectedSegmentChange={onSelectedSegmentChange}
            />
          )}
        </div>
        {!isFullscreen && (
          <div className="w-[340px] shrink-0">
            <CommercialNarrativeCard
              viewModel={viewModel}
              selectedSegmentId={selectedSegmentId}
              commercialRouteModel={commercialRouteModel}
              onViewFullAnalysis={onViewFullAnalysis}
            />
          </div>
        )}
      </div>
    </main>
  );
}
