'use client';

import { FeatureGate } from '@/components/ui/FeatureGate';

export default function DepartmentsPage() {
  return (
    <FeatureGate featureKey="department-management">
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Department Management</h1>
        <p className="text-slate-500">Manage departments and assign navigation items to each department.</p>
      </div>
    </FeatureGate>
  );
}
