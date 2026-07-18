import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEngineeringFocus } from '../../../contexts/EngineeringFocusContext';
import type { EngineeringCauseStageId } from '../../../utils/engineeringAnalysisViewModel';

interface EngineeringStageEvidencePortalProps {
  technology: 'GEO' | 'LEO';
  stage: EngineeringCauseStageId;
  children: ReactNode;
}

/** Moves an existing evidence tree into the single active Cause Chain stage. */
const EngineeringStageEvidencePortal = ({
  technology,
  stage,
  children,
}: EngineeringStageEvidencePortalProps) => {
  const { focus } = useEngineeringFocus();
  const active = focus.kind === 'locked'
    && focus.technology === technology
    && focus.stageId === stage;
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      setHost(null);
      return;
    }
    setHost(document.querySelector<HTMLElement>(
      `[data-engineering-stage-evidence-host="${technology}:${stage}"]`,
    ));
  }, [active, stage, technology]);

  return host ? createPortal(children, host) : null;
};

export default EngineeringStageEvidencePortal;
