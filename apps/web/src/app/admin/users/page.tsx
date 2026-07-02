'use client';

import { FeatureGate } from '@/components/ui/FeatureGate';

export default function UsersPage() {
  return (
    <FeatureGate featureKey="user-management">
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">User Management</h1>
        <p className="text-slate-500">Manage tenant users.</p>
      </div>
    </FeatureGate>
  );
}
