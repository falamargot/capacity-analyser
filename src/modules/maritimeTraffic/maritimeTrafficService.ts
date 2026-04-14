import { log } from '../../utils/logger';
/**
 * Maritime Traffic Service
 * Handles fetching and caching of AIS vessel data from AISStream via server-side proxy SSE
 */

// Vessel types for B2B classification
export enum VesselType {
  CRUISE_SHIP = 'CRUISE_SHIP',
  LUXURY_YACHT = 'LUXURY_YACHT',
  PASSENGER_FERRY = 'PASSENGER_FERRY',
  OFFSHORE_SUPPLY = 'OFFSHORE_SUPPLY',
  CARGO_CONTAINER = 'CARGO_CONTAINER',
  TANKER = 'TANKER',
  UNKNOWN = 'UNKNOWN'
}

// Vessel type configuration with colors and base priority
export const VESSEL_TYPE_CONFIG: Record<VesselType, { color: string; emoji: string; label: string; basePriority: number }> = {
  [VesselType.CRUISE_SHIP]: { color: '#FF69B4', emoji: '🚢', label: 'Cruise Ship', basePriority: 100 },
  [VesselType.LUXURY_YACHT]: { color: '#FFD700', emoji: '🛥️', label: 'Luxury Yacht', basePriority: 90 },
  [VesselType.PASSENGER_FERRY]: { color: '#40E0D0', emoji: '⛴️', label: 'Passenger Ferry', basePriority: 85 },
  [VesselType.OFFSHORE_SUPPLY]: { color: '#9B59B6', emoji: '🏭', label: 'Offshore Supply', basePriority: 80 },
  [VesselType.CARGO_CONTAINER]: { color: '#3498DB', emoji: '📦', label: 'Cargo Container', basePriority: 75 },
  [VesselType.TANKER]: { color: '#E67E22', emoji: '🛢️', label: 'Tanker', basePriority: 70 },
  [VesselType.UNKNOWN]: { color: '#95A5A6', emoji: '🚢', label: 'Unknown', basePriority: 0 }
};

export interface Vessel {
  // AIS fields
  mmsi: string;
  name: string;
  shipType: number;
  vesselType: VesselType;
  latitude: number | null;
  longitude: number | null;
  speed: number | null; // knots
  heading: number | null; // degrees
  course: number | null; // degrees
  length: number | null; // meters
  width: number | null; // meters
  draught: number | null; // meters
  destination: string | null;
  eta: string | null;
  passengers: number | null; // estimated
  // Computed fields
  speed_kmh: number | null;
  b2bPriority: number;
  lastUpdate: number;
}

// EventSource connection state (browser -> local server proxy)
let eventSource: EventSource | null = null;
let vesselCache: Map<string, Vessel> = new Map();
let lastCleanup = 0;
const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

/**
 * Classify AIS ship type code to VesselType
 * Based on AIS Ship Type codes: https://coast.noaa.gov/data/marinecadastre/ais/VesselTypeCodes.pdf
 */
export function classifyVesselType(aisShipType: number, length: number | null, name: string): VesselType {
  // Cruise ships (60-69 are passenger ships)
  if (aisShipType >= 60 && aisShipType <= 69) {
    // Large passenger ships (>200m) are typically cruise ships
    if (length && length > 200) {
      return VesselType.CRUISE_SHIP;
    }
    // Check name patterns for cruise ships
    if (name && /harmony|oasis|symphony|meraviglia|prima|celebrity|princess|carnival|costa|msc|royal/i.test(name)) {
      return VesselType.CRUISE_SHIP;
    }
    return VesselType.PASSENGER_FERRY;
  }

  // Cargo ships (70-79)
  if (aisShipType >= 70 && aisShipType <= 79) {
    return VesselType.CARGO_CONTAINER;
  }

  // Tankers (80-89)
  if (aisShipType >= 80 && aisShipType <= 89) {
    return VesselType.TANKER;
  }

  // Offshore supply/service vessels (50-59)
  if (aisShipType >= 50 && aisShipType <= 59) {
    return VesselType.OFFSHORE_SUPPLY;
  }

  // Yachts/pleasure craft (36-37)
  if (aisShipType === 36 || aisShipType === 37) {
    // Large yachts (>50m) are luxury yachts
    if (length && length > 50) {
      return VesselType.LUXURY_YACHT;
    }
    // Name patterns for luxury yachts
    if (name && /azzam|eclipse|dilbar|al said|topaz|serene|flying fox/i.test(name)) {
      return VesselType.LUXURY_YACHT;
    }
    return VesselType.LUXURY_YACHT;
  }

  return VesselType.UNKNOWN;
}

/**
 * Calculate B2B priority score (0-100)
 */
export function calculateB2BPriority(vessel: Partial<Vessel>): number {
  const config = VESSEL_TYPE_CONFIG[vessel.vesselType || VesselType.UNKNOWN];
  let priority = config.basePriority;

  // Bonus for large vessels (>200m)
  if (vessel.length && vessel.length > 200) {
    priority += 3;
  }

  // Bonus for high passenger capacity (>2000)
  if (vessel.passengers && vessel.passengers > 2000) {
    priority += 2;
  }

  // Bonus for luxury yachts based on size
  if (vessel.vesselType === VesselType.LUXURY_YACHT && vessel.length) {
    if (vessel.length > 100) {
      priority += 5; // Megayachts
    } else if (vessel.length > 75) {
      priority += 3;
    }
  }

  return Math.min(priority, 100);
}

/**
 * Parse AIS message from AISStream.io WebSocket
 * Handles PositionReport; MetaData may use latitude/longitude (lowercase) or position from Message
 */
function parseAISMessage(message: any): Vessel | null {
  try {
    const { MetaData, Message } = message;
    const pos = Message?.PositionReport;
    if (!MetaData || !pos) return null;

    const mmsi = String(MetaData.MMSI ?? pos.UserID ?? '');
    if (!mmsi) return null;

    const name = (MetaData.ShipName ?? MetaData.shipName)?.trim() || `Vessel ${mmsi}`;
    const shipType = MetaData.ShipType ?? MetaData.shipType ?? 0;
    const length = MetaData.length ?? null;

    const vesselType = classifyVesselType(shipType, length, name);

    // Use position from PositionReport first, then MetaData (API may use lowercase lat/lon in MetaData)
    const lat = pos.Latitude ?? (MetaData as any).latitude ?? null;
    const lon = pos.Longitude ?? (MetaData as any).longitude ?? null;
    if (lat == null || lon == null) return null;

    const vessel: Vessel = {
      mmsi,
      name,
      shipType,
      vesselType,
      latitude: lat,
      longitude: lon,
      speed: pos.Sog ?? null,
      heading: pos.TrueHeading !== 511 && pos.TrueHeading != null ? pos.TrueHeading : (pos.Cog ?? null),
      course: pos.Cog ?? null,
      length: length ?? MetaData.length ?? null,
      width: MetaData.width ?? null,
      draught: MetaData.Draught ?? null,
      destination: MetaData.Destination?.trim() || null,
      eta: MetaData.ETA || null,
      passengers: estimatePassengers(vesselType, length ?? MetaData.length ?? null),
      speed_kmh: pos.Sog != null ? pos.Sog * 1.852 : null,
      b2bPriority: 0,
      lastUpdate: Date.now()
    };

    vessel.b2bPriority = vesselType === VesselType.UNKNOWN ? 70 : calculateB2BPriority(vessel);
    return vessel;
  } catch (error) {
    console.warn('🚢 Failed to parse AIS message:', error);
    return null;
  }
}

/**
 * Estimate passenger capacity based on vessel type and size
 */
function estimatePassengers(vesselType: VesselType, length: number | null): number | null {
  if (!length) return null;

  switch (vesselType) {
    case VesselType.CRUISE_SHIP:
      // Rough estimate: ~15 passengers per meter of length
      return Math.round(length * 15);
    case VesselType.PASSENGER_FERRY:
      // Ferries: ~10 passengers per meter
      return Math.round(length * 10);
    case VesselType.LUXURY_YACHT:
      // Yachts: ~0.2 passengers per meter (crew + guests)
      return Math.round(length * 0.2);
    default:
      return null;
  }
}

function getMaritimeStreamUrl(): string {
  const configured = import.meta.env.VITE_MARITIME_STREAM_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }
  const apiBase = (
    (import.meta.env.VITE_LOCAL_API_BASE as string | undefined)
    ?? (import.meta.env.VITE_REGULATORY_API_BASE as string | undefined)
    ?? 'http://localhost:3001'
  ).replace(/\/$/, '');
  return `${apiBase}/api/ais/stream`;
}

/**
 * Connect to maritime SSE stream (server proxy -> AISStream)
 * @param onVesselUpdate - called for each vessel (live or mock)
 * @param onFallbackToMock - called when falling back to mock data so the UI can refresh immediately
 */
export function connectAISStream(
  onVesselUpdate: (vessel: Vessel) => void,
  onFallbackToMock?: () => void
): () => void {
  const streamUrl = getMaritimeStreamUrl();

  try {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    let receivedAnyAisMessage = false;
    let streamConnected = false;
    let replacedMockWithLive = false;
    let fallbackApplied = false;
    const applyMockFallback = (reason?: string) => {
      if (fallbackApplied) return;
      if (receivedAnyAisMessage || streamConnected) return;
      fallbackApplied = true;
      console.warn(`🚢 Live maritime stream unavailable${reason ? ` (${reason})` : ''}. Using sample vessels.`);
      getMockVesselData().forEach((vessel) => {
        vesselCache.set(vessel.mmsi, vessel);
        onVesselUpdate(vessel);
      });
      onFallbackToMock?.();
    };

    // EventSource auto-reconnects by default if the server drops connection.
    eventSource = new EventSource(streamUrl);
    log(`🚢 Connecting maritime stream: ${streamUrl}`);

    const connectTimeout = window.setTimeout(() => {
      if (!receivedAnyAisMessage && !streamConnected) {
        applyMockFallback('connection timeout');
      }
    }, 20000);

    const handleAisMessage = (event: MessageEvent<string>) => {
      receivedAnyAisMessage = true;
      window.clearTimeout(connectTimeout);
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.error('🚢 AISStream API error:', data.error);
          return;
        }
        const vessel = parseAISMessage(data);
        if (vessel && vessel.b2bPriority >= 70) {
          if (fallbackApplied && !replacedMockWithLive) {
            // Replace sample fleet with live feed as soon as the first live vessel arrives.
            vesselCache.clear();
            replacedMockWithLive = true;
            log('🚢 Live maritime data received after fallback, replacing sample vessels');
          }
          vesselCache.set(vessel.mmsi, vessel);
          onVesselUpdate(vessel);
        }
      } catch (error) {
        console.warn('🚢 Failed to process SSE vessel message:', error);
      }
    };

    const handleStatus = (event: MessageEvent<string>) => {
      try {
        const status = JSON.parse(event.data);
        if (status?.state === 'connected') {
          streamConnected = true;
          log('🚢 Maritime stream connected');
          window.clearTimeout(connectTimeout);
          return;
        }

        if (status?.state === 'error' && !receivedAnyAisMessage && !streamConnected) {
          console.warn(`🚢 Maritime stream error: ${status.reason ?? 'unknown'}`);
          applyMockFallback(status.reason ?? 'status error');
        }
      } catch {
        // Ignore invalid status payload
      }
    };

    eventSource.addEventListener('ais', handleAisMessage as EventListener);
    eventSource.addEventListener('status', handleStatus as EventListener);

    eventSource.onerror = () => {
      if (!receivedAnyAisMessage && !streamConnected && eventSource?.readyState === EventSource.CLOSED) {
        applyMockFallback('eventsource closed');
      }
    };

    // Return cleanup function
    return () => {
      window.clearTimeout(connectTimeout);
      if (eventSource) {
        eventSource.removeEventListener('ais', handleAisMessage as EventListener);
        eventSource.removeEventListener('status', handleStatus as EventListener);
        eventSource.close();
        eventSource = null;
      }
    };
  } catch (error) {
    console.error('🚢 Failed to connect to maritime stream:', error);
    const mockVessels = getMockVesselData();
    mockVessels.forEach((vessel) => {
      vesselCache.set(vessel.mmsi, vessel);
      onVesselUpdate(vessel);
    });
    onFallbackToMock?.();
    return () => {};
  }
}

/**
 * Generate mock vessel data for testing/fallback
 */
export function getMockVesselData(): Vessel[] {
  log('🚢 Using mock vessel data');
  
  const now = Date.now();
  
  return [
    {
      mmsi: '311000001',
      name: 'Harmony of the Seas',
      shipType: 69,
      vesselType: VesselType.CRUISE_SHIP,
      latitude: 41.9028,
      longitude: 12.4964, // Near Rome
      speed: 18,
      heading: 135,
      course: 135,
      length: 362,
      width: 66,
      draught: 9.3,
      destination: 'CIVITAVECCHIA',
      eta: null,
      passengers: 5400,
      speed_kmh: 33.3,
      b2bPriority: 100,
      lastUpdate: now
    },
    {
      mmsi: '311000002',
      name: 'MSC Meraviglia',
      shipType: 69,
      vesselType: VesselType.CRUISE_SHIP,
      latitude: 43.2965,
      longitude: 5.3698, // Near Marseille
      speed: 15,
      heading: 270,
      course: 270,
      length: 315,
      width: 43,
      draught: 8.7,
      destination: 'MARSEILLE',
      eta: null,
      passengers: 4500,
      speed_kmh: 27.8,
      b2bPriority: 100,
      lastUpdate: now
    },
    {
      mmsi: '311000003',
      name: 'Ever Given',
      shipType: 70,
      vesselType: VesselType.CARGO_CONTAINER,
      latitude: 35.8989,
      longitude: 14.5146, // Near Malta
      speed: 12,
      heading: 90,
      course: 90,
      length: 400,
      width: 59,
      draught: 14.5,
      destination: 'ROTTERDAM',
      eta: null,
      passengers: null,
      speed_kmh: 22.2,
      b2bPriority: 78,
      lastUpdate: now
    },
    {
      mmsi: '311000004',
      name: 'Azzam',
      shipType: 37,
      vesselType: VesselType.LUXURY_YACHT,
      latitude: 43.6961,
      longitude: 7.2650, // Near Nice
      speed: 25,
      heading: 45,
      course: 45,
      length: 180,
      width: 21,
      draught: 4.3,
      destination: 'MONACO',
      eta: null,
      passengers: 36,
      speed_kmh: 46.3,
      b2bPriority: 98,
      lastUpdate: now
    }
  ];
}

/**
 * Remove vessels that haven't been updated recently
 */
function cleanupStaleVessels(): void {
  const now = Date.now();
  let removed = 0;

  for (const [mmsi, vessel] of vesselCache.entries()) {
    if (now - vessel.lastUpdate > STALE_THRESHOLD) {
      vesselCache.delete(mmsi);
      removed++;
    }
  }

  if (removed > 0) {
    log(`🚢 Cleaned up ${removed} stale vessels`);
  }
}

/**
 * Filter vessels based on camera bounds and priority
 */
export function filterVesselsByView(
  vessels: Vessel[],
  cameraBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null,
  minPriority: number = 70,
  maxVessels: number = 500
): Vessel[] {
  let filtered = vessels.filter(v => v.b2bPriority >= minPriority);

  // Filter by camera bounds if available
  if (cameraBounds) {
    filtered = filtered.filter(v =>
      v.latitude !== null &&
      v.longitude !== null &&
      v.latitude >= cameraBounds.south &&
      v.latitude <= cameraBounds.north &&
      v.longitude >= cameraBounds.west &&
      v.longitude <= cameraBounds.east
    );
  }

  // Sort by B2B priority (highest first)
  filtered.sort((a, b) => b.b2bPriority - a.b2bPriority);

  // Apply hard cap
  return filtered.slice(0, maxVessels);
}

/**
 * Disconnect from WebSocket and clear cache
 */
export function disconnectAISStream(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  vesselCache.clear();
  log('🚢 Maritime stream disconnected and cache cleared');
}
