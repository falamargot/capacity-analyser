import type { ReactNode } from 'react';
import type { EngineeringAnalysisViewModel } from '../../utils/engineeringAnalysisViewModel';

interface EngineeringAnalysisWorkspaceProps {
  viewModel: EngineeringAnalysisViewModel;
  children: ReactNode;
}

/** Existing detailed evidence, embedded directly in the active Cause Chain stage. */
const EngineeringAnalysisWorkspace = ({
  viewModel,
  children,
}: EngineeringAnalysisWorkspaceProps) => (
  <div className="min-w-0 space-y-3" data-engineering-embedded-evidence={viewModel.mode}>
    {children}
  </div>
);

export default EngineeringAnalysisWorkspace;
