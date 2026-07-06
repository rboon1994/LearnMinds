'use client';

import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/contexts/AuthContext';

interface PageHeaderProps {
  defaultTitle: string;
  onOpenMobileMenu: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageHeader({ defaultTitle, onOpenMobileMenu, actions, children }: PageHeaderProps) {
  const { user } = useAuth();
  const title = user?.tenant?.name ?? defaultTitle;
  return (
    <main className="flex-1 px-4 sm:px-6 lg:px-6 py-6 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pb-6 sm:pb-8 mb-0"
        >
          <div className="relative flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onOpenMobileMenu}
                className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                aria-label="Open menu"
              >
                <Icon name="list" className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{title}</h1>
              </div>
            </div>
            {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
          </div>
        </motion.div>

        {children}
      </div>
    </main>
  );
}
