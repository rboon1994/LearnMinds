export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || Number.isNaN(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Parses "mm:ss" or "h:mm:ss" (as entered in the admin duration field) into seconds.
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(':').map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [a, b, c] = parts;
  if (parts.length === 1) return a;
  if (parts.length === 2) return a * 60 + b;
  if (parts.length === 3) return a * 3600 + b * 60 + c;
  return null;
}
