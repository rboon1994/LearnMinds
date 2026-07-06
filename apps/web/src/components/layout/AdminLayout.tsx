'use client';

import { useState } from 'react';
import { Navigation } from '@/components/layout/Navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

interface AdminLayoutProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function AdminLayout({ title, actions, children }: AdminLayoutProps) {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navUserName = user?.fullName ?? '';
  const navUser = { name: navUserName, initials: initials(navUserName), role: user?.role ?? '' };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation user={navUser} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader defaultTitle={title} onOpenMobileMenu={() => setMobileMenuOpen(true)} actions={actions}>
          {children}
        </PageHeader>
      </div>
    </div>
  );
}
