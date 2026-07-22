'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/contexts/AuthContext';

interface PageHeaderProps {
  defaultTitle: string;
  // When set, renders a back-button + stacked title/subtitle (a "detail page" header) instead
  // of the usual big tenant-name/page-title heading.
  backHref?: string;
  subtitle?: string;
  onOpenMobileMenu: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageHeader({ defaultTitle, backHref, subtitle, onOpenMobileMenu, actions, children }: PageHeaderProps) {
  const { user } = useAuth();
  const title = user?.tenant?.name ?? defaultTitle;
  return (
    <main className="flex-1 px-4 sm:px-6 lg:px-6 py-6 overflow-x-clip">
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
              {backHref ? (
                <>
                  <Link
                    href={backHref}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <Icon name="arrow-left" className="h-4 w-4" />
                  </Link>
                  <div>
                    <h1 className="text-lg font-bold leading-tight text-slate-900">{defaultTitle}</h1>
                    {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
                  </div>
                </>
              ) : (
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{title}</h1>
                </div>
              )}
            </div>
            {actions && (
              <div className="flex w-full shrink-0 flex-col gap-3 *:w-full sm:w-auto sm:flex-row sm:items-center sm:*:w-auto">
                {actions}
              </div>
            )}
          </div>
        </motion.div>

        {children}
      </div>
    </main>
  );
}
