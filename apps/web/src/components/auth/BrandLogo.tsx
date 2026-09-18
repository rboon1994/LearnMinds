import Image from 'next/image';
import Link from 'next/link';

// Single source of truth for the brand assets — update here to change the logo everywhere.
export const BRAND_LOGO_SRC = {
  full: '/prominds-ai-logo.png',
  icon: '/prominds-ai-icon.png',
} as const;

export function BrandLogo() {
  return (
    <Link href="/" aria-label="Go to homepage">
      <Image
        src={BRAND_LOGO_SRC.full}
        alt="Prominds AI Logo"
        width={240}
        height={40}
        priority
      />
    </Link>
  );
}
