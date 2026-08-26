import Image from 'next/image';
import Link from 'next/link';

export function BrandLogo() {
  return (
    <Link href="/" aria-label="Go to homepage">
      <Image
        src="/prominds-ai-logo.png"
        alt="Prominds AI Logo"
        width={240}
        height={40}
        priority
      />
    </Link>
  );
}
