import React, { createContext, useContext, useState, ReactNode } from 'react';
import { type CoveragePolicy } from '../utils/leoFootprint';

interface SimulationContextType {
    coveragePolicy: CoveragePolicy;
    setCoveragePolicy: (value: CoveragePolicy) => void;
}

const SimulationContext = createContext<SimulationContextType>({
    coveragePolicy: { type: "DB_THRESHOLD", thresholdDb: -10 },
    setCoveragePolicy: () => {}
});

export const useSimulation = () => useContext(SimulationContext);

export const SimulationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Backward compatibility: Check for legacy numeric threshold in localStorage
    const getInitialPolicy = (): CoveragePolicy => {
        if (typeof window !== 'undefined') {
            const legacyThreshold = localStorage.getItem('beamThresholdDb');
            if (legacyThreshold) {
                const threshold = Number(legacyThreshold);
                if (!isNaN(threshold)) {
                    // Convert legacy numeric threshold to new policy structure
                    localStorage.removeItem('beamThresholdDb'); // Clean up legacy storage
                    return { type: "DB_THRESHOLD", thresholdDb: threshold };
                }
            }
        }
        return { type: "DB_THRESHOLD", thresholdDb: -10 };
    };

    const [coveragePolicy, setCoveragePolicy] = useState<CoveragePolicy>(getInitialPolicy);
    
    return (
        <SimulationContext.Provider value={{ coveragePolicy, setCoveragePolicy }}>
            {children}
        </SimulationContext.Provider>
    );
};
