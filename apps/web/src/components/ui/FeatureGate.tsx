'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  featureKey: string;
  /** Shown when the feature is locked (upsell). Defaults to a simple locked banner. */
  locked?: ReactNode;
  children: ReactNode;
}

export function FeatureGate({ featureKey, locked, children }: Props) {
  const { user } = useAuth();
  const feature = user?.adminFeatures.find((f) => f.key === featureKey);
  if (!feature) return null;
  if (feature.featureStatus === 'locked') {
    return locked ? (
      <>{locked}</>
    ) : (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1">Upgrade Required</h3>
        <p className="text-sm text-slate-500 max-w-xs">
          {feature.name} is not available on your current plan. Upgrade to unlock this feature.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
