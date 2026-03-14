import { memo } from 'react';
import { MapPin, Plane, Ship, Satellite, Radio } from 'lucide-react';

interface SidebarContextBarProps {
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  selectedVesselName?: string;
  selectedSatelliteName?: string;
  inspectedSNPName?: string;
  position?: { lat: number; lng: number } | null;
}

const SidebarContextBar = memo<SidebarContextBarProps>(({
  analysisSource,
  aircraftCallsign,
  selectedVesselName,
  selectedSatelliteName,
  inspectedSNPName,
  position,
}) => {
  // Determine what to show based on the current analysis target
  let icon: React.ReactNode;
  let label: string;
  let accentColor: string;

  if (inspectedSNPName) {
    icon = <Radio className="h-4 w-4" />;
    label = `SNP: ${inspectedSNPName}`;
    accentColor = 'text-emerald-600 dark:text-emerald-400';
  } else if (selectedSatelliteName) {
    icon = <Satellite className="h-4 w-4" />;
    label = selectedSatelliteName;
    accentColor = 'text-blue-600 dark:text-blue-400';
  } else if (analysisSource === 'aircraft' && aircraftCallsign) {
    icon = <Plane className="h-4 w-4" />;
    label = aircraftCallsign;
    accentColor = 'text-sky-600 dark:text-sky-400';
  } else if (selectedVesselName) {
    icon = <Ship className="h-4 w-4" />;
    label = selectedVesselName;
    accentColor = 'text-teal-600 dark:text-teal-400';
  } else if (position) {
    icon = <MapPin className="h-4 w-4" />;
    label = `${position.lat.toFixed(4)}°, ${position.lng.toFixed(4)}°`;
    accentColor = 'text-gray-700 dark:text-gray-300';
  } else {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700 px-4 py-2.5">
      <div className={`flex items-center gap-2 ${accentColor}`}>
        {icon}
        <span className="text-sm font-semibold truncate">{label}</span>
      </div>
    </div>
  );
});

SidebarContextBar.displayName = 'SidebarContextBar';
export default SidebarContextBar;
