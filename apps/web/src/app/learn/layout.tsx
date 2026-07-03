'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { landingRoute } from '@/lib/nav';

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const hasAccess = user?.navItems.some((n) => n.href === '/learn') ?? false;

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !hasAccess) router.replace(landingRoute(user.navItems));
  }, [loading, user, hasAccess, router]);

  if (loading) return null;
  if (!user || !hasAccess) return null;

  return <>{children}</>;
}
