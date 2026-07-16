'use client';

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { AuthFooterLink, AuthHeader, AuthLayout } from '@/components/auth/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/Toast';
import { apiUrl } from '@/lib/api';
import { landingRoute } from '@/lib/nav';
import { useAuth } from '@/contexts/AuthContext';

type LoginFormData = {
  email: string;
  password: string;
};

function landingPath(user: { mustChangePassword: boolean; navItems: Parameters<typeof landingRoute>[0] }) {
  return user.mustChangePassword ? '/change-password' : landingRoute(user.navItems);
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) {
      router.replace(landingPath(user));
    }
  }, [user, loading, router]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const validateForm = (): { error: string; field: 'email' | 'password' } | null => {
    if (!formData.email) return { error: 'Please enter your email address', field: 'email' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return { error: 'Please enter a valid email format', field: 'email' };
    if (!formData.password) return { error: 'Please enter your password', field: 'password' };
    if (formData.password.length < 8) return { error: 'Password must be at least 8 characters', field: 'password' };
    return null;
  };

  const handleLogin = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    const validation = validateForm();
    if (validation) {
      setError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 403 && errorData.message === 'Account is not active') {
          toast.accountInactive();
          setIsLoading(false);
          return;
        }
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem('token', data.access_token);
        try {
          const me = await fetch(`${apiUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          }).then((r) => r.json());
          window.location.replace(landingPath({ mustChangePassword: me.mustChangePassword, navItems: me.navItems ?? [] }));
        } catch {
          window.location.replace('/learn');
        }
      } else {
        throw new Error('Login failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="AI-Powered Learning Platform"
      description="Start your AI learning journey with personalized experiences. Upload content, create AI agents, and transform how you learn."
    >
      <div className="w-full">
        <AuthHeader
          title="Welcome back"
          description="Sign in to continue your learning journey"
          variant="compact"
        />

        <form className="space-y-5 mt-8" onSubmit={handleLogin} noValidate>
          <Input
            id="email"
            label="Email Address"
            name="email"
            onChange={handleChange}
            placeholder=" "
            required
            type="email"
            value={formData.email}
            variant="floating"
          />

          <PasswordInput
            id="password"
            label="Password"
            name="password"
            onChange={handleChange}
            placeholder=" "
            required
            showStrength={false}
            value={formData.password}
            variant="floating"
          />

          <div className="flex items-center justify-end text-sm">
            <a
              href="/forgot-password"
              className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Forgot password?
            </a>
          </div>

          {error && <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>{error}</Alert>}

          <Button
            className="w-full py-3.5 text-base font-semibold shadow-lg"
            isLoading={isLoading}
            loadingLabel="Signing in..."
            type="submit"
            variant="gradient"
          >
            Sign In
          </Button>
        </form>

        <AuthFooterLink href="/signup" linkLabel="Sign up" prompt="Don't have an account?" />
      </div>
    </AuthLayout>
  );
}
