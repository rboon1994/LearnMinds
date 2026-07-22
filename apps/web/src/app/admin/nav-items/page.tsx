'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type NavItem = {
  id: string;
  name: string;
  href: string;
  icon: string;
  packages: string[];
  isStudentVisible: boolean;
  isSystem: boolean;
  status: string;
};

const ALL_PACKAGES = ['FREE', 'PRO', 'ENTERPRISE'] as const;

export default function NavItemsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<NavItem[]>([]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.replace('/admin'); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${apiUrl}/nav-items`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {});
  }, [user, router]);

  const togglePackage = async (item: NavItem, pkg: string) => {
    const token = localStorage.getItem('token');
    const next = item.packages.includes(pkg)
      ? item.packages.filter((p) => p !== pkg)
      : [...item.packages, pkg];
    await fetch(`${apiUrl}/nav-items/${item.id}/packages`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: next }),
    });
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, packages: next } : i)));
  };

  const toggleStudentVisible = async (item: NavItem) => {
    const token = localStorage.getItem('token');
    const next = !item.isStudentVisible;
    await fetch(`${apiUrl}/nav-items/${item.id}/student-visible`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStudentVisible: next }),
    });
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isStudentVisible: next } : i)));
  };

  const persistOrder = async (ordered: NavItem[]) => {
    const token = localStorage.getItem('token');
    await fetch(`${apiUrl}/nav-items/reorder`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map((i) => i.id) }),
    });
  };

  if (user?.role !== 'SUPER_ADMIN') return null;

  const columns: AdminTableColumn<NavItem>[] = [
    { header: 'Nav Item', render: (item) => item.name },
    ...ALL_PACKAGES.map((pkg) => ({
      header: pkg,
      className: 'text-center',
      render: (item: NavItem) => (
        <input
          type="checkbox"
          checked={item.packages.includes(pkg)}
          onChange={() => togglePackage(item, pkg)}
          className="w-4 h-4 accent-indigo-600 cursor-pointer"
        />
      ),
    })),
    {
      header: 'Student',
      className: 'text-center',
      render: (item) => (
        <input
          type="checkbox"
          checked={item.isStudentVisible}
          onChange={() => toggleStudentVisible(item)}
          className="w-4 h-4 accent-indigo-600 cursor-pointer"
        />
      ),
    },
  ];

  return (
    <AdminLayout title="Nav Item Visibility" backHref="/admin">
      <AdminTable
        columns={columns}
        data={items}
        keyField="id"
        emptyMessage="No nav items yet."
        reorder={{ onReorder: setItems, onReorderEnd: persistOrder }}
      />
    </AdminLayout>
  );
}
