// Two independent checks rather than one rigid combined regex, so a link that's clearly
// YouTube but in an unanticipated path shape still fails closed (returns null) instead of
// being silently misparsed: first confirm the host is YouTube-family, then search the whole
// URL for an 11-char id next to any known marker (watch?v=, youtu.be/, /embed/, /shorts/,
// /live/, /v/) — trailing query params (e.g. ?si=...) after the id don't affect the match.
const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/;
const YOUTUBE_ID_RE = /(?:v=|\/(?:embed|shorts|live|v)\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYoutubeId(url: string): string | null {
  try {
    if (!YOUTUBE_HOST_RE.test(new URL(url).hostname)) return null;
    return url.match(YOUTUBE_ID_RE)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}
