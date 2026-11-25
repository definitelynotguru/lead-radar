export function unixToIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function hoursBetween(from: Date | string, to: Date | string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
}

export function utcHourKey(date = new Date()): string {
  return date.toISOString().slice(0, 13);
}

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function utcDayOfMonth(date = new Date()): number {
  return date.getUTCDate();
}
