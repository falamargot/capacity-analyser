import { useEffect, useMemo, useState } from 'react';
import type { EngineeringConfigureDraft } from '../types/engineeringConfigure';
import {
  engineeringConfigureDraftSignature,
  getAffectedEngineeringStages,
  getEngineeringConfigureChanges,
} from '../utils/engineeringConfigureModel';

export function useEngineeringConfigureDraft(baseline: EngineeringConfigureDraft) {
  const baselineSignature = engineeringConfigureDraftSignature(baseline);
  const [draft, setDraft] = useState(baseline);

  useEffect(() => {
    setDraft(baseline);
  }, [baselineSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(
    () => getEngineeringConfigureChanges(baseline, draft),
    [baseline, draft],
  );
  const affectedStages = useMemo(
    () => getAffectedEngineeringStages(changes),
    [changes],
  );

  return {
    draft,
    setDraft,
    changes,
    affectedStages,
    discard: () => setDraft(baseline),
  };
}
