import { createContext, useContext, type ReactNode } from 'react';
import type { EngineeringAnalysis } from '../hooks/useEngineeringAnalysis';

/**
 * M2: distributes the single App-level engineering analysis result to every
 * engineering surface. The value is computed once by useEngineeringAnalysis
 * in App; consumers must never recompute any of its fields.
 */
const EngineeringAnalysisContext = createContext<EngineeringAnalysis | null>(null);

export const EngineeringAnalysisProvider = ({
  value,
  children,
}: {
  value: EngineeringAnalysis;
  children: ReactNode;
}) => (
  <EngineeringAnalysisContext.Provider value={value}>
    {children}
  </EngineeringAnalysisContext.Provider>
);

// eslint-disable-next-line react-refresh/only-export-components
export const useEngineeringAnalysisContext = (): EngineeringAnalysis => {
  const value = useContext(EngineeringAnalysisContext);
  if (!value) {
    throw new Error('useEngineeringAnalysisContext requires an EngineeringAnalysisProvider ancestor.');
  }
  return value;
};
