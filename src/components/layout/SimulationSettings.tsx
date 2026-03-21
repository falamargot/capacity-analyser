import React, { useState } from 'react';
import { useSimulation } from '../../contexts/SimulationContext';
import { getRadiusAtPowerLevel, STANDARD_RADIUS_KM, type CoveragePolicy } from '../../utils/leoFootprint';
import { ChevronDown, Settings, Circle } from 'lucide-react';
import { SatelliteScope } from '../SatelliteScopeFilter';

interface SimulationSettingsProps {
    satelliteScope: SatelliteScope;
}

const SimulationSettings: React.FC<SimulationSettingsProps> = ({ satelliteScope }) => {
    const { coveragePolicy, setCoveragePolicy } = useSimulation();
    const [isOpen, setIsOpen] = useState(false);
    
    // Helper functions for different policy types
    const isServiceZoneMode = coveragePolicy.type === "SERVICE_ZONE";
    const currentThreshold = coveragePolicy.type === "DB_THRESHOLD" ? coveragePolicy.thresholdDb : -10;
    
    const getThresholdDescription = (policy: CoveragePolicy): string => {
        if (policy.type === "SERVICE_ZONE") {
            return 'Simplified circular approximation for service eligibility';
        }
        const db = policy.thresholdDb;
        if (db >= -4) return 'Strict beam threshold - highest link margin';
        if (db >= -8) return 'Beam-based threshold - balanced eligibility';
        if (db >= -11) return 'Extended beam threshold - wider eligibility';
        return 'Maximum beam eligibility - lowest accepted threshold';
    };
    
    const getLinkQuality = (db: number): string => {
        if (db >= -4) return 'Excellent';
        if (db >= -8) return 'Good';
        if (db >= -11) return 'Acceptable';
        return 'Minimum';
    };

    const getThresholdPresetLabel = (db: number): string => {
        if (db === -12) return 'Extended';
        if (db === -10) return 'Standard';
        if (db === -3) return 'Strict';
        return `${db} dB`;
    };

    const handlePolicyChange = (policy: CoveragePolicy) => {
        setCoveragePolicy(policy);
    };

    const handleSliderChange = (value: string) => {
        if (value === "SERVICE_ZONE") {
            setCoveragePolicy({ type: "SERVICE_ZONE" });
        } else {
            const dbValue = Number(value);
            setCoveragePolicy({ type: "DB_THRESHOLD", thresholdDb: dbValue });
        }
    };
    
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                    satelliteScope === 'GEO' 
                        ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed' 
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
                disabled={satelliteScope === 'GEO'}
                title={satelliteScope === 'GEO' ? 'LEO settings not available for GEO scope' : 'LEO simulation settings'}
            >
                <Settings className="h-4 w-4" />
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-50">
                    <div className="p-4">
                        <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
                            LEO Coverage Model
                        </h3>
                        
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Coverage Model
                                        <span 
                                            className="ml-2 text-gray-400 cursor-help" 
                                            title="Simulation-wide parameter affecting connectivity eligibility, auto-selection, and coverage visualization"
                                        >
                                            ⓘ
                                        </span>
                                    </label>
                                    <span className={`text-sm font-bold ${isServiceZoneMode ? 'text-cyan-600 dark:text-cyan-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                        {isServiceZoneMode ? (
                                            <span className="flex items-center gap-1">
                                                <Circle className="h-3 w-3" />
                                                Service Zone
                                            </span>
                                        ) : (
                                            `Beam-based · ${currentThreshold} dB`
                                        )}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        className={`px-3 py-2 text-xs rounded flex items-center justify-center gap-1 transition-colors ${
                                            isServiceZoneMode
                                                ? 'bg-cyan-600 text-white'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                        }`}
                                        onClick={() => handlePolicyChange({ type: "SERVICE_ZONE" })}
                                    >
                                        <Circle className="h-3 w-3" />
                                        Service Zone
                                    </button>
                                    <button
                                        className={`px-3 py-2 text-xs rounded transition-colors ${
                                            !isServiceZoneMode
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                        }`}
                                        onClick={() => handlePolicyChange({ type: "DB_THRESHOLD", thresholdDb: currentThreshold })}
                                    >
                                        Beam-based
                                    </button>
                                </div>
                            </div>

                            {!isServiceZoneMode && (
                                <>
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Beam Threshold
                                            </label>
                                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                                {currentThreshold} dB
                                            </span>
                                        </div>

                                        <div className="relative">
                                            <input
                                                type="range"
                                                min="-12"
                                                max="-3"
                                                step="1"
                                                value={currentThreshold}
                                                onChange={(e) => handleSliderChange(e.target.value)}
                                                className="w-full h-8 appearance-none cursor-pointer bg-gray-200 dark:bg-gray-700 rounded-lg"
                                            />
                                            <div className="flex justify-between text-xs px-2 mt-1 text-gray-500 dark:text-gray-400">
                                                <span>-12</span>
                                                <span>-11</span>
                                                <span>-10</span>
                                                <span>-9</span>
                                                <span>-8</span>
                                                <span>-7</span>
                                                <span>-6</span>
                                                <span>-5</span>
                                                <span>-4</span>
                                                <span>-3</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        {[-12, -10, -3].map((preset) => (
                                            <button
                                                key={preset}
                                                className={`px-3 py-2 text-xs rounded transition-colors ${
                                                    coveragePolicy.type === "DB_THRESHOLD" && coveragePolicy.thresholdDb === preset
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                }`}
                                                onClick={() => handlePolicyChange({ type: "DB_THRESHOLD", thresholdDb: preset })}
                                            >
                                                {getThresholdPresetLabel(preset)}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            
                            {/* Description panel */}
                            <div className={`p-3 rounded text-xs ${
                                isServiceZoneMode 
                                    ? 'bg-cyan-50 dark:bg-cyan-900/20' 
                                    : 'bg-blue-50 dark:bg-blue-900/20'
                            }`}>
                                <p className="text-gray-700 dark:text-gray-300 mb-2">
                                    <strong>{getThresholdDescription(coveragePolicy)}</strong>
                                </p>
                                <div className="space-y-1 text-gray-600 dark:text-gray-400">
                                    {isServiceZoneMode ? (
                                        <>
                                            <div className="flex justify-between">
                                                <span>Model:</span>
                                                <span className="font-medium">Circular approximation</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Eligibility radius:</span>
                                                <span className="font-medium">{STANDARD_RADIUS_KM} km</span>
                                            </div>
                                            <div className="mt-2 text-xs">
                                                <p>• Simplified service-zone approximation</p>
                                                <p>• Circular coverage from a 37° elevation mask</p>
                                                <p>• No individual beam geometry</p>
                                                <p>• Useful for quick what-if analysis</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between">
                                                <span>Threshold footprint:</span>
                                                <span className="font-medium">{Math.round(getRadiusAtPowerLevel(currentThreshold))} km</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Coverage strictness:</span>
                                                <span className="font-medium">{getLinkQuality(currentThreshold)}</span>
                                            </div>
                                            <div className="mt-2 text-xs">
                                                <p>• Reference simulation mode for LEO coverage</p>
                                                <p>• 16 highly elliptical beams per satellite</p>
                                                <p>• Threshold-based beam eligibility ({currentThreshold} dB)</p>
                                                <p>• eoPortal-like geometry, then scaled by simulation physics</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            
                            {/* Warning panel */}
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-xs">
                                <div className="flex items-start gap-2">
                                    <span className="text-yellow-600 dark:text-yellow-400">⚠️</span>
                                    <div className="text-gray-700 dark:text-gray-300">
                                        <strong>Simulation-wide Setting</strong>
                                        <p className="mt-1">
                                            {isServiceZoneMode 
                                                ? "Service Zone is a simplified circular approximation. It affects RF eligibility, auto-selection, aggregated coverage, and capacity calculations."
                                                : "Beam-based mode is the reference LEO simulation model. The selected threshold affects RF eligibility, auto-selection, capacity calculations, and coverage visualization."
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SimulationSettings;
