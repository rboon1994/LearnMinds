'use client';

import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthFooterLink, AuthHeader, AuthLayout } from '@/components/auth/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PhoneField } from '@/components/ui/PhoneField';
import { apiUrl } from '@/lib/api';

type SignupFormData = {
  name: string;
  email: string;
  phone: string;
  dialCode: string;
  organization: string;
  password: string;
  confirmPassword: string;
};

// Split E.164 "+60162809580" using the known dialCode "60" → { phoneCountryCode: "60", phoneNo: "162809580" }
function parsePhone(raw: string, dialCode: string): { phoneCountryCode: string; phoneNo: string } {
  const normalized = raw.replace(/\s/g, '');
  const prefix = `+${dialCode}`;
  if (!normalized.startsWith(prefix)) return { phoneCountryCode: '', phoneNo: '' };
  return { phoneCountryCode: dialCode, phoneNo: normalized.slice(prefix.length) };
}

export default function SignupPage() {
  const [formData, setFormData] = useState<SignupFormData>({
    name: '', email: '', phone: '', dialCode: '60', organization: '', password: '', confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const validateForm = (): { error: string; field: 'name' | 'email' | 'phone' | 'organization' | 'password' | 'confirmPassword' } | null => {
    if (!formData.name.trim()) return { error: 'Please enter your full name', field: 'name' };
    if (formData.name.trim().length < 2) return { error: 'Name must be at least 2 characters', field: 'name' };
    if (!formData.email) return { error: 'Please enter your email address', field: 'email' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return { error: 'Please enter a valid email format', field: 'email' };
    if (!formData.phone || formData.phone.replace(/\D/g, '').length < 7) return { error: 'Please enter a valid phone number', field: 'phone' };
    if (!formData.organization.trim()) return { error: 'Please enter your organization name', field: 'organization' };
    if (!formData.password) return { error: 'Please enter a password', field: 'password' };
    if (formData.password.length < 8) return { error: 'Password must be at least 8 characters', field: 'password' };
    if (formData.password !== formData.confirmPassword) return { error: 'Passwords do not match', field: 'confirmPassword' };
    return null;
  };

  const handleSignup = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    const validation = validateForm();
    if (validation) {
      setError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }

    const { phoneCountryCode, phoneNo } = parsePhone(formData.phone, formData.dialCode);
    if (!phoneCountryCode) {
      setError('Please select a valid country code');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.name.trim(),
          email: formData.email,
          phoneCountryCode,
          phoneNo,
          organization: formData.organization,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }

      setSuccess('Account created! Redirecting...');
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title={'Get Started\nFor Free'}
      description="Join thousands of teams already using LearnMinds to build smarter, faster, and more collaborative workplaces."
    >
      <div className="w-full">
        <AuthHeader
          title="Create your account"
          description="Start your AI-powered learning journey today"
          variant="compact"
        />

        <form className="space-y-4 mt-8" onSubmit={handleSignup} noValidate>
          <Input
            id="name"
            label="Full Name"
            name="name"
            onChange={handleChange}
            placeholder=" "
            required
            type="text"
            value={formData.name}
            variant="floating"
          />

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

          <PhoneField
            id="phone"
            label="Phone Number"
            value={formData.phone}
            onChange={(phone, dialCode) => {
              setFormData((prev) => ({ ...prev, phone, dialCode }));
              if (error) setError('');
            }}
            required
          />

          <Input
            id="organization"
            label="Organization Name"
            name="organization"
            onChange={handleChange}
            placeholder=" "
            required
            value={formData.organization}
            variant="floating"
          />

          <PasswordInput
            id="password"
            label="Password"
            name="password"
            onChange={handleChange}
            placeholder=" "
            required
            showStrength={true}
            value={formData.password}
            variant="floating"
          />

          <PasswordInput
            id="confirmPassword"
            label="Confirm Password"
            name="confirmPassword"
            onChange={handleChange}
            placeholder=" "
            required
            value={formData.confirmPassword}
            variant="floating"
          />

          {error && <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>{error}</Alert>}
          {success && <Alert type="success" icon={<Icon name="check-circle" className="h-4 w-4" />}>{success}</Alert>}

          <Button
            className="w-full py-3.5 text-base font-semibold shadow-lg"
            isLoading={isLoading}
            loadingLabel="Creating account..."
            type="submit"
            variant="gradient"
          >
            Create Account
          </Button>
        </form>

        <AuthFooterLink href="/login" linkLabel="Sign in" prompt="Already have an account?" />
      </div>
    </AuthLayout>
  );
}
