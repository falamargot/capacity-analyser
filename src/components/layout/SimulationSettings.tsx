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
            return 'Service Zone – Circular coverage (37° elevation)';
        }
        const db = policy.thresholdDb;
        if (db >= -4) return 'Strict coverage - High quality links only';
        if (db >= -8) return 'Standard coverage - Balanced quality';
        if (db >= -11) return 'Extended coverage - Wider footprints';
        return 'Maximum coverage - Lower quality acceptable';
    };
    
    const getLinkQuality = (db: number): string => {
        if (db >= -4) return 'Excellent';
        if (db >= -8) return 'Good';
        if (db >= -11) return 'Acceptable';
        return 'Minimum';
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
                title={satelliteScope === 'GEO' ? 'LEO settings not available for GEO scope' : 'LEO Coverage Settings'}
            >
                <Settings className="h-4 w-4" />
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-50">
                    <div className="p-4">
                        <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
                            LEO Coverage Threshold
                        </h3>
                        
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Coverage Mode
                                        <span 
                                            className="ml-2 text-gray-400 cursor-help" 
                                            title="Global parameter affecting connectivity eligibility, satellite auto-selection, and coverage visualization"
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
                                            `${currentThreshold} dB`
                                        )}
                                    </span>
                                </div>
                                
                                {/* Custom slider with Service Zone option */}
                                <div className="relative">
                                    <div className="flex">
                                        {/* Service Zone option */}
                                        <button
                                            className={`flex-1 py-2 text-xs rounded-l-lg border-r transition-colors ${
                                                isServiceZoneMode
                                                    ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700'
                                                    : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700'
                                            }`}
                                            onClick={() => handleSliderChange("SERVICE_ZONE")}
                                        >
                                            <Circle className="h-3 w-3 mx-auto mb-1" />
                                            Service Zone
                                        </button>
                                        
                                        {/* Numeric slider container */}
                                        <div className="flex-1 relative">
                                            <input
                                                type="range"
                                                min="-12"
                                                max="-3"
                                                step="1"
                                                value={currentThreshold}
                                                onChange={(e) => handleSliderChange(e.target.value)}
                                                disabled={isServiceZoneMode}
                                                className={`w-full h-8 rounded-r-lg appearance-none cursor-pointer ${
                                                    isServiceZoneMode 
                                                        ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-slate-800' 
                                                        : 'bg-gray-200 dark:bg-gray-700'
                                                }`}
                                            />
                                            <div className={`flex justify-between text-xs px-2 mt-1 ${
                                                isServiceZoneMode ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                                            }`}>
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
                                </div>
                            </div>
                            
                            {/* Preset buttons */}
                            <div className="grid grid-cols-4 gap-2">
                                <button 
                                    className={`px-3 py-2 text-xs rounded flex items-center justify-center gap-1 ${
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
                                    className={`flex-1 px-3 py-2 text-xs rounded ${
                                        coveragePolicy.type === "DB_THRESHOLD" && coveragePolicy.thresholdDb === -12
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                                    onClick={() => handlePolicyChange({ type: "DB_THRESHOLD", thresholdDb: -12 })}
                                >
                                    Extended
                                </button>
                                <button 
                                    className={`flex-1 px-3 py-2 text-xs rounded ${
                                        coveragePolicy.type === "DB_THRESHOLD" && coveragePolicy.thresholdDb === -10
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                                    onClick={() => handlePolicyChange({ type: "DB_THRESHOLD", thresholdDb: -10 })}
                                >
                                    Standard
                                </button>
                                <button 
                                    className={`flex-1 px-3 py-2 text-xs rounded ${
                                        coveragePolicy.type === "DB_THRESHOLD" && coveragePolicy.thresholdDb === -3
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                                    onClick={() => handlePolicyChange({ type: "DB_THRESHOLD", thresholdDb: -3 })}
                                >
                                    Strict
                                </button>
                            </div>
                            
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
                                                <span>Coverage model:</span>
                                                <span className="font-medium">Circular (37° elevation)</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Coverage radius:</span>
                                                <span className="font-medium">{STANDARD_RADIUS_KM} km</span>
                                            </div>
                                            <div className="mt-2 text-xs">
                                                <p>• Simple circular footprint</p>
                                                <p>• Based on 37° minimum elevation</p>
                                                <p>• No individual beam calculation</p>
                                                <p>• Standard service zone coverage</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between">
                                                <span>Beam radius:</span>
                                                <span className="font-medium">{Math.round(getRadiusAtPowerLevel(currentThreshold))} km</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Link quality:</span>
                                                <span className="font-medium">{getLinkQuality(currentThreshold)}</span>
                                            </div>
                                            <div className="mt-2 text-xs">
                                                <p>• Individual beam calculation</p>
                                                <p>• 16 beams per satellite</p>
                                                <p>• Threshold-based coverage</p>
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
                                        <strong>Global Parameter</strong>
                                        <p className="mt-1">
                                            {isServiceZoneMode 
                                                ? "Service Zone mode: connectivity based on simple circular footprint (37° elevation). Affects satellite auto-selection, aggregated coverage, and capacity calculations."
                                                : "This threshold affects entire simulation including RF connectivity (beam-based), capacity calculations, and coverage visualization."
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
