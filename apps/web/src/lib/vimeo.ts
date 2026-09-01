// Vimeo's oEmbed endpoint is public (no auth) and CORS-enabled, so it can be called
// straight from the browser to read a video's duration without a backend proxy.
export async function fetchVimeoDuration(url: string): Promise<number | null> {
  try {
    // Delegate URL-shape validation to Vimeo's own oEmbed resolver instead of hand-matching every
    // link format (share, player/embed, private hash, channels, groups, albums, review pages, ...).
    if (!/(^|\.)vimeo\.com$/.test(new URL(url).hostname)) return null;
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.duration === 'number' ? data.duration : null;
  } catch {
    return null;
  }
}

export type VimeoVideoInfo =
  | { ok: true; thumbnailUrl: string; embedUrl: string }
  | { ok: false; reason: 'not_vimeo' | 'private_or_embed_disabled' | 'unknown' };

// Resolves a testimonial's cover photo + playable embed url from a Vimeo link, called once by
// the admin form at save time (see "Testimonial video resolution" in the landing-page plan) —
// never by the public page at render time. Distinguishes a private/embed-disabled video (Vimeo's
// oEmbed call 403/404s) from a non-Vimeo link, so the admin form can show a specific reason
// instead of one indistinguishable failure message.
export async function fetchVimeoVideoInfo(url: string): Promise<VimeoVideoInfo> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'not_vimeo' };
  }
  if (!/(^|\.)vimeo\.com$/.test(parsed.hostname)) return { ok: false, reason: 'not_vimeo' };
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    if (res.status === 403 || res.status === 404) {
      return { ok: false, reason: 'private_or_embed_disabled' };
    }
    if (!res.ok) return { ok: false, reason: 'unknown' };
    const data = await res.json();
    if (typeof data.thumbnail_url !== 'string' || typeof data.video_id !== 'number') {
      return { ok: false, reason: 'unknown' };
    }
    return {
      ok: true,
      thumbnailUrl: data.thumbnail_url,
      embedUrl: `https://player.vimeo.com/video/${data.video_id}`,
    };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}
