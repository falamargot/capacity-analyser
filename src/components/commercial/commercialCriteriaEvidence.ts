import type { DataNature } from '../../utils/dataProvenance';
import type { CommercialCriterionId } from './commercialObjective';

/**
 * Per-criterion evidence carried through the ENG → COMM seam. Reuses the
 * canonical {@link DataNature} taxonomy from dataProvenance rather than inventing
 * a parallel one, so a scored value can always be explained with where it came
 * from, how solid it is, and when it was acquired.
 */
export interface CommercialCriterionEvidence<T = number> {
  value: T | null;
  unit?: string;
  nature: DataNature;
  source: string;
  asOf?: string | number | null;
  note?: string;
}

/** Evidence bundle a technology option can carry for explainability. */
export type CommercialCriteriaEvidence = Partial<
  Record<CommercialCriterionId, CommercialCriterionEvidence<number | boolean>>
>;
