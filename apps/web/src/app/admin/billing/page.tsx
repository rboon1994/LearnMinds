'use client';

import { FeatureGate } from '@/components/ui/FeatureGate';

export default function BillingPage() {
  return (
    <FeatureGate featureKey="billing">
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Billing</h1>
        <p className="text-slate-500">Manage your subscription and billing details.</p>
      </div>
    </FeatureGate>
  );
}
