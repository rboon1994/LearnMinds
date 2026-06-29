import Image from 'next/image';

export function BrandLogo() {
  return (
    <Image
      src="/Learnminds-Logo-Hor-Web.png"
      alt="LearnMinds Logo"
      width={240}
      height={80}
      priority
    />
  );
}
