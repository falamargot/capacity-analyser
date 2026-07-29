import type { SatelliteData } from '../../types/satellites';

/**
 * Position is deliberately excluded: it is consumed through the live position
 * cell and must not force 680 React component renders every propagation tick.
 */
export const sameSatelliteVisualIdentity = (
    previous: SatelliteData,
    next: SatelliteData,
): boolean => (
    previous.id === next.id
    && previous.name === next.name
    && previous.type === next.type
    && previous.opsStatus === next.opsStatus
);
