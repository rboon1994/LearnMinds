'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Reorder } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type AdminFeature = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  packages: string[];
  isSystem: boolean;
  status: string;
};

const ALL_PACKAGES = ['FREE', 'PRO', 'ENTERPRISE'] as const;

export default function AdminFeaturesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [features, setFeatures] = useState<AdminFeature[]>([]);
  const featuresRef = useRef(features);
  useEffect(() => { featuresRef.current = features; }, [features]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.replace('/admin'); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${apiUrl}/admin-features`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setFeatures)
      .catch(() => {});
  }, [user, router]);

  const togglePackage = async (feature: AdminFeature, pkg: string) => {
    const token = localStorage.getItem('token');
    const next = feature.packages.includes(pkg)
      ? feature.packages.filter((p) => p !== pkg)
      : [...feature.packages, pkg];
    await fetch(`${apiUrl}/admin-features/${feature.id}/packages`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: next }),
    });
    setFeatures((prev) => prev.map((f) => (f.id === feature.id ? { ...f, packages: next } : f)));
  };

  const persistOrder = async () => {
    const token = localStorage.getItem('token');
    await fetch(`${apiUrl}/admin-features/reorder`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: featuresRef.current.map((f) => f.id) }),
    });
  };

  if (user?.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Admin Feature Access</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <div className="min-w-[640px] text-sm">
          <div className="flex items-center px-4 py-3 bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <div className="w-8 shrink-0" />
            <div className="flex-1">Feature</div>
            <div className="flex-1">Description</div>
            {ALL_PACKAGES.map((pkg) => (
              <div key={pkg} className="w-20 shrink-0 text-center">{pkg}</div>
            ))}
          </div>
          <Reorder.Group
            axis="y"
            values={features}
            onReorder={setFeatures}
            className="divide-y divide-slate-100"
          >
            {features.map((feature) => (
              <Reorder.Item
                key={feature.id}
                value={feature}
                onDragEnd={persistOrder}
                className="flex items-center px-4 py-3 bg-white hover:bg-slate-50"
              >
                <div className="w-8 shrink-0 text-slate-300 cursor-grab active:cursor-grabbing select-none">⠿</div>
                <div className="flex-1 font-medium text-slate-900">{feature.name}</div>
                <div className="flex-1 text-slate-500">{feature.description ?? '—'}</div>
                {ALL_PACKAGES.map((pkg) => (
                  <div key={pkg} className="w-20 shrink-0 text-center">
                    <input
                      type="checkbox"
                      checked={feature.packages.includes(pkg)}
                      onChange={() => togglePackage(feature, pkg)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                  </div>
                ))}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
      </div>
    </div>
  );
}
