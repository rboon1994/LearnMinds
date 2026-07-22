'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { landingRoute } from '@/lib/nav';

// Same guard shape as apps/web/src/app/learn/layout.tsx — a route group (no URL segment) shared
// by /agents and /ai-chat so neither page has to duplicate the auth check.
export default function AiAgentChatLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const hasAccess =
    user?.navItems.some((n) => n.href === '/ai-chat' || n.href === '/agents') ?? false;

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !hasAccess) router.replace(landingRoute(user.navItems));
  }, [loading, user, hasAccess, router]);

  if (loading) return null;
  if (!user || !hasAccess) return null;

  return <>{children}</>;
}
