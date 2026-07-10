'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiUrl } from '@/lib/api';

export type NavItem = {
  id: string;
  name: string;
  href: string;
  icon: string;
  order: number;
};

export type AdminFeature = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  featureStatus: 'available' | 'locked';
};

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER' | 'STUDENT';
  tenant: { id: string; name: string; package: string } | null;
  department: { id: string; name: string } | null;
  navItems: NavItem[];
  adminFeatures: AdminFeature[];
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  reload: () => void;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, reload: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    const controller = new AbortController();
    fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => {
        if (r.ok) return r.json();
        // 401/403 = token invalid → clear user; 5xx = transient → keep existing state
        if (r.status === 401 || r.status === 403) { setUser(null); }
        return null;
      })
      .then((data) => { if (data) setUser(data); })
      .catch((err) => { if (err.name !== 'AbortError') console.error('auth/me fetch failed', err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [tick]);

  return (
    <AuthContext.Provider value={{ user, loading, reload: () => setTick((t) => t + 1) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
