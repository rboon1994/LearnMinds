// Split E.164 "+60162809580" using the known dialCode "60" → { phoneCountryCode: "60", phoneNo: "162809580" }
export function parsePhone(raw: string, dialCode: string): { phoneCountryCode: string; phoneNo: string } {
  const normalized = raw.replace(/\s/g, '');
  const prefix = `+${dialCode}`;
  if (!normalized.startsWith(prefix)) return { phoneCountryCode: '', phoneNo: '' };
  return { phoneCountryCode: dialCode, phoneNo: normalized.slice(prefix.length) };
}
