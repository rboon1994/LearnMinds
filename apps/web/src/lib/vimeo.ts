// Vimeo's oEmbed endpoint is public (no auth) and CORS-enabled, so it can be called
// straight from the browser to read a video's duration without a backend proxy.
export async function fetchVimeoDuration(url: string): Promise<number | null> {
  if (!/vimeo\.com\/\d+/.test(url)) return null;
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.duration === 'number' ? data.duration : null;
  } catch {
    return null;
  }
}
