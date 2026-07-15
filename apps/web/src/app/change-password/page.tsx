'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthHeader, AuthLayout } from '@/components/auth/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { apiUrl } from '@/lib/api';
import { landingRoute } from '@/lib/nav';
import { useAuth } from '@/contexts/AuthContext';

type ChangePasswordFormData = {
  newPassword: string;
  confirmPassword: string;
};

export default function ChangePasswordPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState<ChangePasswordFormData>({ newPassword: '', confirmPassword: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!user.mustChangePassword) router.replace(landingRoute(user.navItems));
  }, [user, loading, router]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const validateForm = (): { error: string; field: 'newPassword' | 'confirmPassword' } | null => {
    if (!formData.newPassword) return { error: 'Please enter a new password', field: 'newPassword' };
    if (formData.newPassword.length < 8) return { error: 'Password must be at least 8 characters', field: 'newPassword' };
    if (formData.newPassword !== formData.confirmPassword) return { error: 'Passwords do not match', field: 'confirmPassword' };
    return null;
  };

  const handleSubmit = async (event: { preventDefault(): void }) => {
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
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/auth/change-password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: formData.newPassword }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to change password');
      }

      window.location.replace(landingRoute(user?.navItems ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || !user || !user.mustChangePassword) return null;

  return (
    <AuthLayout
      title="AI-Powered Learning Platform"
      description="Start your AI learning journey with personalized experiences. Upload content, create AI agents, and transform how you learn."
    >
      <div className="w-full">
        <AuthHeader
          title="Set a new password"
          description="You're using a default password. Please choose a new one to continue."
          variant="compact"
        />

        <form className="space-y-5 mt-8" onSubmit={handleSubmit} noValidate>
          <PasswordInput
            id="newPassword"
            label="New Password"
            name="newPassword"
            onChange={handleChange}
            placeholder=" "
            required
            showStrength
            value={formData.newPassword}
            variant="floating"
          />

          <PasswordInput
            id="confirmPassword"
            label="Confirm New Password"
            name="confirmPassword"
            onChange={handleChange}
            placeholder=" "
            required
            showStrength={false}
            value={formData.confirmPassword}
            variant="floating"
          />

          {error && <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>{error}</Alert>}

          <Button
            className="w-full py-3.5 text-base font-semibold shadow-lg"
            isLoading={isLoading}
            loadingLabel="Updating..."
            type="submit"
            variant="gradient"
          >
            Update Password
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-600">
          <a
            href="/login"
            className="font-medium text-indigo-600 transition-colors hover:text-indigo-500"
            onClick={() => localStorage.removeItem('token')}
          >
            Back to Login
          </a>
        </p>
      </div>
    </AuthLayout>
  );
}
