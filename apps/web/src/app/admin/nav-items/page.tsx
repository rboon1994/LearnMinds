'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

  if (user?.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Nav Item Visibility</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Nav Item</th>
              {ALL_PACKAGES.map((pkg) => (
                <th key={pkg} className="px-4 py-3 text-center">{pkg}</th>
              ))}
              <th className="px-4 py-3 text-center">Student</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                {ALL_PACKAGES.map((pkg) => (
                  <td key={pkg} className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={item.packages.includes(pkg)}
                      onChange={() => togglePackage(item, pkg)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                  </td>
                ))}
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.isStudentVisible}
                    onChange={() => toggleStudentVisible(item)}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
