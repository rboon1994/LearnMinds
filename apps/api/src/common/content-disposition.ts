// A plain `filename="..."` with percent-encoded non-ASCII bytes (what both download routes did
// before this) is not reliably decoded by browsers — some show the raw %XX-encoded string as the
// actual saved filename instead of decoding it. RFC 6266/5987's fix is pairing an ASCII-safe
// fallback in `filename=` with the properly-specified `filename*=UTF-8''<percent-encoded>`
// extended form modern browsers actually use for the real (possibly non-ASCII) name.
export function buildContentDispositionHeader(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_') || 'download';
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
