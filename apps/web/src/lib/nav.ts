export function landingRoute(navItems: { href: string }[]) {
  return navItems[0]?.href ?? '/learn';
}
