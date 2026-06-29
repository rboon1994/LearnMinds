import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandLogo } from './BrandLogo';

// ─── AuthLayout ───────────────────────────────────────────────────────────────

type AuthLayoutProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  showBranding?: boolean;
};

export function AuthLayout({ children, title, description, showBranding = true }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-emerald-50">
      {/* Aurora background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[60px] opacity-30 animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(126,217,87,0.35), transparent)', top: '-100px', left: '-100px' }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[60px] opacity-25 animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(0,123,255,0.25), transparent)', bottom: '-150px', right: '-100px' }}
        />
        <div
          className="absolute w-[350px] h-[350px] rounded-full blur-[60px] opacity-30 animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(78,205,196,0.3), transparent)', top: '40%', left: '60%' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        {/* Mobile branding */}
        <div className="lg:hidden mb-6 flex justify-center">
          <BrandLogo />
        </div>

        <div className="rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl bg-white/70 border border-white/80">
          <div className="flex flex-col lg:flex-row">
            {/* Left — branding (desktop only) */}
            {showBranding && (
              <div
                className="hidden lg:flex lg:w-5/12 flex-col justify-center p-10 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(126,217,87,0.08), rgba(78,205,196,0.08), rgba(0,123,255,0.08))' }}
              >
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-30"
                     style={{ background: 'radial-gradient(circle, rgba(78,205,196,0.4), transparent)' }} />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-30"
                     style={{ background: 'radial-gradient(circle, rgba(126,217,87,0.4), transparent)' }} />

                <div className="relative z-10">
                  <div className="mb-10">
                    <BrandLogo />
                  </div>
                  {title && (
                    <h1 className="text-slate-900 text-3xl font-bold mb-4 leading-tight">
                      {title.split('\n')[0]}
                      {title.split('\n')[1] && (
                        <span className="bg-gradient-to-r from-green-400 via-teal-400 to-blue-500 bg-clip-text text-transparent">
                          {' '}{title.split('\n')[1]}
                        </span>
                      )}
                    </h1>
                  )}
                  {description && (
                    <p className="text-slate-600 text-base leading-relaxed">{description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Right — content */}
            <div className={showBranding ? 'w-full lg:w-7/12' : 'w-full'}>
              <div className="p-8 lg:p-12">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AuthHeader ───────────────────────────────────────────────────────────────

type AuthHeaderProps = {
  title: string;
  description: string;
  variant?: 'default' | 'compact';
};

export function AuthHeader({ title, description, variant = 'default' }: AuthHeaderProps) {
  if (variant === 'compact') {
    return (
      <div className="mb-6">
        <h2 className="text-slate-900 text-2xl font-bold mb-1">{title}</h2>
        <p className="text-slate-500 text-sm">{description}</p>
      </div>
    );
  }

  return (
    <div className="mb-8 text-center">
      <h2 className="mb-2 text-3xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500">{description}</p>
    </div>
  );
}

// ─── AuthFooterLink ───────────────────────────────────────────────────────────

type AuthFooterLinkProps = {
  href: string;
  linkLabel: string;
  prompt: string;
};

export function AuthFooterLink({ href, linkLabel, prompt }: AuthFooterLinkProps) {
  return (
    <p className="mt-8 text-center text-sm text-slate-600">
      {prompt}{' '}
      <Link className="font-medium text-indigo-600 transition-colors hover:text-indigo-500" href={href}>
        {linkLabel}
      </Link>
    </p>
  );
}
