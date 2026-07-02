'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const first = user?.adminFeatures.find((f) => f.featureStatus === 'available');
    if (first) {
      const routes: Record<string, string> = {
        'user-management': '/admin/users',
        'department-management': '/admin/departments',
        'nav-management': '/admin/nav-items',
        'admin-feature-management': '/admin/admin-features',
        'billing': '/admin/billing',
      };
      router.replace(routes[first.key] ?? '/learn');
    }
  }, [user, router]);

  return null;
}
