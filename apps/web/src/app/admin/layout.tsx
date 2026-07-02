'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role === 'USER') router.replace('/learn');
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return null;
  if (!user || user.role === 'USER') return null;

  return <>{children}</>;
}
