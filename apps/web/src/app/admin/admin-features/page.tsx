'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
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

  const persistOrder = async (ordered: AdminFeature[]) => {
    const token = localStorage.getItem('token');
    await fetch(`${apiUrl}/admin-features/reorder`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map((f) => f.id) }),
    });
  };

  if (user?.role !== 'SUPER_ADMIN') return null;

  const columns: AdminTableColumn<AdminFeature>[] = [
    { header: 'Feature', render: (feature) => feature.name },
    { header: 'Description', render: (feature) => feature.description ?? '—' },
    ...ALL_PACKAGES.map((pkg) => ({
      header: pkg,
      className: 'text-center',
      render: (feature: AdminFeature) => (
        <input
          type="checkbox"
          checked={feature.packages.includes(pkg)}
          onChange={() => togglePackage(feature, pkg)}
          className="w-4 h-4 accent-indigo-600 cursor-pointer"
        />
      ),
    })),
  ];

  return (
    <AdminLayout title="Admin Feature Access" backHref="/admin">
      <AdminTable
        columns={columns}
        data={features}
        keyField="id"
        emptyMessage="No admin features yet."
        reorder={{ onReorder: setFeatures, onReorderEnd: persistOrder }}
      />
    </AdminLayout>
  );
}
