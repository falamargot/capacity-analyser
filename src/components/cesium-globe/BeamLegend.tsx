import React from 'react';
import { FREQUENCY_REUSE } from '../../config/beamVisualization';

const BeamLegend: React.FC = () => {
    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-lg shadow-lg border border-gray-200 dark:border-slate-800 flex flex-col items-center gap-2 pointer-events-auto">
            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">
                LEO Frequency Reuse
            </div>
            <div className="flex items-center gap-4">
                {Object.entries(FREQUENCY_REUSE.COLORS).map(([group, color]) => (
                    <div key={`legend-${group}`} className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full border border-white/20"
                            style={{ backgroundColor: color.toCssColorString() }}
                        />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                            {group.slice(-1)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default React.memo(BeamLegend);
