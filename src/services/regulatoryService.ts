export interface RestrictedTerritory {
    name: string;
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
}

// Approximate bounding boxes for restricted territories
// Note: These are simplified rectangles and do not represent exact borders.
// A real implementation would requires GeoJSON polygon checking.
const RESTRICTED_TERRITORIES: RestrictedTerritory[] = [
    {
        name: 'China',
        minLat: 18.0,
        maxLat: 53.5,
        minLng: 73.0,
        maxLng: 135.0
    },
    {
        name: 'Russia',
        minLat: 41.0,
        maxLat: 82.0,
        minLng: 19.0, // Kaliningrad starts around 19E, main landmass starts further east but this covers it
        maxLng: 180.0 // Extends across to 180 (and technically wraps [-180, -169] but simplified here)
    },
    // Split Russia due to longitude wrapping issues if needed, or simply handle > 19 && < 180 for most
    // We can add a second box for Far East Russia wrapping if necessary, but 180 cutoff is main landmass.
];

export const isRestrictedTerritory = (lat: number, lng: number): { isRestricted: boolean; territoryName?: string } => {
    for (const territory of RESTRICTED_TERRITORIES) {
        if (
            lat >= territory.minLat &&
            lat <= territory.maxLat &&
            lng >= territory.minLng &&
            lng <= territory.maxLng
        ) {
            return { isRestricted: true, territoryName: territory.name };
        }
    }
    return { isRestricted: false };
};
