import { memo } from 'react';
import type { LocationResult } from '../../hooks/useLocationSearch';
import type { ConnectivityEndpoint } from '../../components/commercial/commercialTypes';
import ScenarioEndpointEditor from '../../components/commercial/ScenarioEndpointEditor';
import SharedTerminalSelector from './SharedTerminalSelector';

export interface SharedEndpointCardProps {
  endpoint?: ConnectivityEndpoint;
  fallback: string;
  roleLabel: 'Origin' | 'Destination';
  variant: 'origin' | 'destination';
  onSelectLocation: (location: LocationResult) => void;
}

function SharedEndpointCard({
  endpoint,
  fallback,
  roleLabel,
  variant,
  onSelectLocation,
}: SharedEndpointCardProps) {
  const isSet = Boolean(endpoint?.label?.trim());

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <ScenarioEndpointEditor
        endpoint={endpoint}
        fallback={fallback}
        roleLabel={roleLabel}
        variant={variant}
        onSelectLocation={onSelectLocation}
      />
      <div className="flex min-h-5 min-w-0 flex-wrap items-center gap-1 overflow-hidden">
        <SharedTerminalSelector terminals={endpoint?.terminals} showPlaceholder={isSet} />
      </div>
    </div>
  );
}

export default memo(SharedEndpointCard);
