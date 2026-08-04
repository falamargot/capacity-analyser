export interface SimulationTimeInputValue {
  date: string;
  time: string;
}

function assertValidTimestamp(timestampMs: number): void {
  if (!Number.isFinite(timestampMs)) {
    throw new RangeError('Simulation timestamp must be finite');
  }
}

export function formatSimulationTimeInput(timestampMs: number): SimulationTimeInputValue {
  assertValidTimestamp(timestampMs);
  const iso = new Date(timestampMs).toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
  };
}

export function formatSimulationTimeReadout(timestampMs: number): string {
  const value = formatSimulationTimeInput(timestampMs);
  return `${value.date} ${value.time} UTC`;
}

/** Parses date/time fields as UTC and rejects browser date normalization. */
export function parseSimulationTimeInput(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;

  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const timestampMs = Date.parse(`${date}T${normalizedTime}.000Z`);
  if (!Number.isFinite(timestampMs)) return null;

  const roundTrip = formatSimulationTimeInput(timestampMs);
  return roundTrip.date === date && roundTrip.time === normalizedTime
    ? timestampMs
    : null;
}
