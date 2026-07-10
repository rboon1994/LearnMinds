'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { apiUrl } from '@/lib/api';

export default function NewCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setIsLoading(true);
    setError('');
    const token = localStorage.getItem('token');
    const res = await fetch(`${apiUrl}/courses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || undefined,
        thumbnail: thumbnail || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    });
    setIsLoading(false);
    if (!res.ok) {
      setError('Failed to create course');
      return;
    }
    const course = await res.json();
    router.push(`/admin/courses/${course.id}`);
  };

  return (
    <FeatureGate featureKey="course-management">
      <div className="p-8 max-w-xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">New Course</h1>
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <Input id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="block w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-4 focus:ring-teal-400/10 focus:border-teal-400"
            />
          </div>
          <Input
            id="thumbnail"
            label="Thumbnail"
            value={thumbnail}
            onChange={(e) => setThumbnail(e.target.value)}
            placeholder="https://..."
          />
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <Input
                id="startDate"
                label="Start date"
                onChange={(e) => setStartDate(e.target.value)}
                type="date"
                value={startDate}
              />
            </div>
            <div className="flex-1 min-w-0">
              <Input
                id="endDate"
                label="End date"
                onChange={(e) => setEndDate(e.target.value)}
                type="date"
                value={endDate}
              />
            </div>
          </div>
          {error && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {error}
            </Alert>
          )}
          <div className="flex gap-3">
            <Button type="submit" isLoading={isLoading} loadingLabel="Creating...">
              Create Course
            </Button>
            <Button type="button" variant="secondary" href="/admin/courses">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </FeatureGate>
  );
}
