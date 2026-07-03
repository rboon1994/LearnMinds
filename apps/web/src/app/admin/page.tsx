'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Navigation } from '@/components/layout/Navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

const FEATURE_META: Record<string, { href: string; icon: IconName; color: string; subtitle: string }> = {
  'user-management': { href: '/admin/users', icon: 'user', color: 'bg-blue-50', subtitle: 'Manage users and roles' },
  'department-management': { href: '/admin/departments', icon: 'building', color: 'bg-purple-50', subtitle: 'Organize departments' },
  'navigation-management': { href: '/admin/nav-items', icon: 'list', color: 'bg-indigo-50', subtitle: 'Configure navigation' },
  'admin-feature-management': { href: '/admin/admin-features', icon: 'cog', color: 'bg-green-50', subtitle: 'Manage admin features' },
  billing: { href: '/admin/billing', icon: 'credit-card', color: 'bg-orange-50', subtitle: 'Payments and subscriptions' },
};

// Fallback for any AdminFeature without a matching route/icon above — keeps it
// visible (with its own description) instead of silently vanishing from the dashboard.
const DEFAULT_META: { href: string | null; icon: IconName; color: string; subtitle?: string } = {
  href: null,
  icon: 'cog',
  color: 'bg-slate-50',
};

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navUserName = user?.fullName ?? '';
  const navUser = { name: navUserName, initials: initials(navUserName), role: user?.role ?? '' };
  const features = user?.adminFeatures ?? [];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation
        user={navUser}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader
          defaultTitle="Admin Dashboard"
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5"
          >
            {features.map((feature, idx) => {
              const meta = FEATURE_META[feature.key] ?? DEFAULT_META;
              const locked = feature.featureStatus === 'locked';
              const clickable = !locked && !!meta.href;
              return (
                <motion.button
                  key={feature.id}
                  type="button"
                  onClick={() => { if (clickable) router.push(meta.href!); }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  whileHover={clickable ? { y: -4 } : undefined}
                  className={`group bg-white rounded-xl p-6 border border-slate-200 flex flex-col items-center text-center transition-all ${
                    clickable ? 'hover:border-slate-300 hover:shadow-lg cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className={`relative w-16 h-16 rounded-xl ${meta.color} bg-opacity-10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon name={meta.icon} className="w-8 h-8 text-slate-700" />
                    {locked && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                        <Icon name="lock" className="w-3 h-3 text-amber-500" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-slate-700 transition-colors">
                    {feature.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {locked ? 'Upgrade required' : meta.subtitle ?? feature.description ?? ''}
                  </p>
                </motion.button>
              );
            })}
          </motion.div>
        </PageHeader>
      </div>
    </div>
  );
}
