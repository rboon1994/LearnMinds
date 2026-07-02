'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

  if (user?.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Admin Feature Access</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Feature</th>
              <th className="px-4 py-3 text-left">Description</th>
              {ALL_PACKAGES.map((pkg) => (
                <th key={pkg} className="px-4 py-3 text-center">{pkg}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {features.map((feature) => (
              <tr key={feature.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{feature.name}</td>
                <td className="px-4 py-3 text-slate-500">{feature.description ?? '—'}</td>
                {ALL_PACKAGES.map((pkg) => (
                  <td key={pkg} className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={feature.packages.includes(pkg)}
                      onChange={() => togglePackage(feature, pkg)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
