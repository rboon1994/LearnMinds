'use client';

import { useEffect, useState } from 'react';
import { Navigation } from '@/components/layout/Navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

type Membership = {
  id: string;
  tier: string;
  startDate: string;
  endDate: string;
  amount: number;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
};

type Enrollment = {
  id: string;
  expiresAt: string | null;
  course: { id: string; title: string } | null;
  series: { id: string; name: string } | null;
};

type Profile = {
  fullName: string;
  email: string;
  memberships: Membership[];
  enrollments: Enrollment[];
  referralCode: string | null;
  referralCount: number;
  pendingCommission: number;
  approvedCommission: number;
  totalCommission: number;
};

const STATUS_LABELS: Record<Membership['status'], string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

const STATUS_BADGE_CLASSES: Record<Membership['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

// Same one-liner used by every other page that builds Navigation's `user` prop from
// AuthContext's `fullName` (apps/web/src/app/learn/page.tsx) — Navigation's NavUser type wants
// {name, initials, role}, not AuthContext's AuthUser shape directly.
function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export default function ProfilePage() {
  // AuthContext's useAuth() returns { user, loading, reload } — there is no logout function;
  // Navigation has its own built-in default (clears the token and redirects to /login) used by
  // every other page, so onLogout is intentionally not passed here either.
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/auth/profile`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => {});
  }, []);

  if (!authUser || !profile) return null;

  const navUser = { name: authUser.fullName, initials: initials(authUser.fullName), role: authUser.role };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Navigation user={navUser} />
      <main className="flex-1 p-8 max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">My Profile</h1>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Basic Info</h2>
          <p className="text-slate-900">{profile.fullName}</p>
          <p className="text-slate-500 text-sm">{profile.email}</p>
        </section>

        {profile.memberships.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Membership</h2>
            <div className="space-y-3">
              {profile.memberships.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-slate-900 font-medium">{m.tier}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(m.startDate)} – {formatDate(m.endDate)} · RM {m.amount.toFixed(2)}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_BADGE_CLASSES[m.status]}`}>
                    {STATUS_LABELS[m.status]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Enrolled Courses</h2>
          {profile.enrollments.length === 0 ? (
            <p className="text-slate-400 text-sm">No enrolled courses yet.</p>
          ) : (
            <ul className="space-y-2">
              {profile.enrollments.map((e) => (
                <li key={e.id} className="text-slate-900 text-sm">
                  {e.course?.title ?? e.series?.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        {profile.referralCode && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Referral</h2>
            <p className="text-slate-900">
              Your referral code: <span className="font-mono font-semibold">{profile.referralCode}</span>
            </p>
            <p className="text-slate-500 text-sm mt-1">{profile.referralCount} people referred</p>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <p className="text-xs text-slate-500">Pending</p>
                <p className="text-slate-900 font-semibold">RM {profile.pendingCommission.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Approved</p>
                <p className="text-slate-900 font-semibold">RM {profile.approvedCommission.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-slate-900 font-semibold">RM {profile.totalCommission.toFixed(2)}</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
