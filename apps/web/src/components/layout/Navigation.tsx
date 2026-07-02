'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/contexts/AuthContext';

export interface NavUser {
  name: string;
  initials: string;
  role: string;
}

interface NavigationProps {
  user: NavUser;
  onLogout?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  showUpgradeCard?: boolean;
}

export function Navigation({
  user,
  onLogout,
  mobileOpen = false,
  onMobileClose,
  showUpgradeCard = true,
}: NavigationProps) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { user: authUser } = useAuth();

  const items = (authUser?.navItems ?? []).map((n) => ({
    id: n.id,
    name: n.name,
    href: n.href,
    icon: n.icon as IconName,
  }));

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMobileClose}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-50 bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="group/logo h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="flex w-full justify-center"
              aria-label="Expand sidebar"
            >
              <Image src="/Learnminds-Icon Web.png" alt="LearnMinds" width={35} height={35} priority />
            </button>
          ) : (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden pr-2">
                <Image src="/Learnminds-Logo-Hor-Web.png" alt="LearnMinds" width={210} height={70} priority />
              </motion.div>
              <button
                onClick={() => setCollapsed(true)}
                className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0 opacity-0 group-hover/logo:opacity-100"
                aria-label="Collapse sidebar"
              >
                <Icon name="chevrons-left" className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          {!collapsed && (
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
              Menu
            </div>
          )}
          <nav className="space-y-1 mb-6">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => { if (item.href) router.push(item.href); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group ${
                  pathname === item.href
                    ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {pathname === item.href && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-600 rounded-r-full"
                  />
                )}
                <Icon
                  name={item.icon}
                  className={`w-5 h-5 shrink-0 ${
                    pathname === item.href ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                {!collapsed && <span className="flex-1 text-left whitespace-nowrap">{item.name}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-200 p-3 flex-shrink-0">
          {showUpgradeCard && !collapsed && (
            <div className="mx-2 mb-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white relative overflow-hidden">
              <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 blur-xl" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/10 blur-xl" />
              <div className="relative">
                <div className="text-sm font-semibold mb-1">Upgrade Plan</div>
                <div className="text-xs text-indigo-100 mb-3 leading-relaxed">Get the best of LearnMinds with higher limits</div>
                <button className="w-full py-1.5 bg-white text-indigo-600 text-xs font-semibold rounded-lg hover:bg-indigo-50 transition-colors">
                  Upgrade Now
                </button>
              </div>
            </div>
          )}

          <div
            className={`flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {user.initials.charAt(0)}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{user.name}</div>
                  <div className="text-xs text-slate-500 truncate">{user.role}</div>
                </div>
                <button
                  onClick={() => {
                    if (onLogout) { onLogout(); return; }
                    localStorage.removeItem('token');
                    window.location.replace('/login');
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors"
                  aria-label="Log out"
                >
                  <Icon name="logout" className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
