import React from 'react';
import { Ship, Power } from 'lucide-react';
import { Vessel, VesselType } from '../modules/maritimeTraffic/maritimeTrafficService';

interface VesselSelectorProps {
    vessels: Vessel[];
    selectedVessel?: Vessel | null;
    onSelect: (vessel: Vessel | null) => void;
    liveModeEnabled: boolean;
    onToggleLiveMode: () => void;
    disabled?: boolean;
    /** Short in-field text for THIS disabled state — see AircraftSelector. */
    disabledLabel?: string;
    /** Long-form tooltip for the same state. */
    disabledReason?: string;
}

const VesselSelector: React.FC<VesselSelectorProps> = ({
    vessels,
    selectedVessel,
    onSelect,
    liveModeEnabled,
    onToggleLiveMode,
    disabled = false,
    disabledLabel,
    disabledReason,
}) => {
    // Sort vessels by B2B priority (highest first), then by name
    const sortedVessels = [...vessels].sort((a, b) => {
        if (b.b2bPriority !== a.b2bPriority) {
            return b.b2bPriority - a.b2bPriority;
        }
        return a.name.localeCompare(b.name);
    });

    // Get short type name for dropdown
    const getShortType = (type: VesselType): string => {
        switch (type) {
            case VesselType.CRUISE_SHIP: return 'Cruise';
            case VesselType.LUXURY_YACHT: return 'Yacht';
            case VesselType.PASSENGER_FERRY: return 'Ferry';
            case VesselType.OFFSHORE_SUPPLY: return 'Offshore';
            case VesselType.CARGO_CONTAINER: return 'Cargo';
            case VesselType.TANKER: return 'Tanker';
            default: return 'Vessel';
        }
    };

    // Format vessel display label
    const formatVesselLabel = (vessel: Vessel): string => {
        const shortType = getShortType(vessel.vesselType);
        return `${vessel.name} · ${shortType}`;
    };

    const handleVesselSelect = (mmsi: string) => {
        if (mmsi === '') {
            onSelect(null);
            return;
        }
        const selected = vessels.find(v => v.mmsi === mmsi);
        if (selected) {
            onSelect(selected);
        }
    };

    return (
        <div className="flex min-w-0 items-center gap-2 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            <div className="relative min-w-0 flex-1">
                <Ship className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <select
                    value={selectedVessel?.mmsi || ''}
                    onChange={(e) => handleVesselSelect(e.target.value)}
                    disabled={!liveModeEnabled || disabled}
                    title={disabled ? disabledReason : undefined}
                    className="w-full min-w-0 pl-10 pr-8 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed transition-colors"
                >
                    <option value="">
                        {disabled
                            ? disabledLabel ?? 'Unavailable'
                            : liveModeEnabled
                            ? `Select vessel... (${vessels.length})`
                            : 'Enable live mode'
                        }
                    </option>
                    {sortedVessels.map(vessel => (
                        <option key={vessel.mmsi} value={vessel.mmsi}>
                            {formatVesselLabel(vessel)}
                        </option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                            fillRule="evenodd"
                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                            clipRule="evenodd"
                        />
                    </svg>
                </div>
            </div>

            <button
                onClick={onToggleLiveMode}
                disabled={disabled}
                className={`shrink-0 flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${liveModeEnabled
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                    }`}
                title={disabled ? disabledReason : liveModeEnabled ? 'Disable live vessel data' : 'Enable live vessel data'}
            >
                <Power className="h-4 w-4" />
            </button>
        </div>
    );
};

export default VesselSelector;
