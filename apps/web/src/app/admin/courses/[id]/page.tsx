'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Reorder } from 'framer-motion';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatDuration, parseDuration } from '@/lib/duration';

type Lesson = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  order: number;
  status: 'DRAFT' | 'PUBLISHED';
  videoType: 'UPLOAD' | 'EXTERNAL_LINK';
  videoUrl: string | null;
  durationSeconds: number | null;
};

type CourseFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type Course = {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  lessons: Lesson[];
  files: CourseFile[];
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function EditCoursePage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const courseId = params.id;

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const lessonsRef = useRef(lessons);
  useEffect(() => {
    lessonsRef.current = lessons;
  }, [lessons]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [error, setError] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonVideoType, setNewLessonVideoType] = useState<'UPLOAD' | 'EXTERNAL_LINK'>('EXTERNAL_LINK');
  const [newLessonVideoUrl, setNewLessonVideoUrl] = useState('');

  const load = () => {
    fetch(`${apiUrl}/courses/${courseId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Course) => {
        setCourse(data);
        setLessons(data.lessons);
        setTitle(data.title);
        setDescription(data.description ?? '');
        setCoverImageUrl(data.coverImageUrl ?? '');
      })
      .catch(() => setError('Failed to load course'));
  };

  useEffect(() => {
    if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courseId, router]);

  if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return null;
  if (!course) return null;

  const saveMeta = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSavingMeta(true);
    setError('');
    const res = await fetch(`${apiUrl}/courses/${courseId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: description || null, coverImageUrl: coverImageUrl || null }),
    });
    setSavingMeta(false);
    if (!res.ok) {
      setError('Failed to save course');
      return;
    }
    load();
  };

  const togglePublish = async () => {
    const status = course.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    await fetch(`${apiUrl}/courses/${courseId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const deleteCourse = async () => {
    if (!confirm('Delete this course and all its lessons/files?')) return;
    await fetch(`${apiUrl}/courses/${courseId}`, { method: 'DELETE', headers: authHeaders() });
    router.push('/admin/courses');
  };

  const persistLessonOrder = async () => {
    await fetch(`${apiUrl}/courses/${courseId}/lessons/reorder`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: lessonsRef.current.map((l) => l.id) }),
    });
  };

  const addLesson = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newLessonTitle.trim()) return;
    if (newLessonVideoType === 'EXTERNAL_LINK' && !newLessonVideoUrl.trim()) return;
    await fetch(`${apiUrl}/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newLessonTitle,
        videoType: newLessonVideoType,
        videoUrl: newLessonVideoType === 'EXTERNAL_LINK' ? newLessonVideoUrl : undefined,
      }),
    });
    setNewLessonTitle('');
    setNewLessonVideoUrl('');
    load();
  };

  const deleteLesson = async (lessonId: string) => {
    if (!confirm('Delete this lesson?')) return;
    await fetch(`${apiUrl}/courses/${courseId}/lessons/${lessonId}`, { method: 'DELETE', headers: authHeaders() });
    load();
  };

  const toggleLessonPublish = async (lesson: Lesson) => {
    const status = lesson.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    await fetch(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await fetch(`${apiUrl}/courses/${courseId}/files`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    e.target.value = '';
    load();
  };

  const deleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    await fetch(`${apiUrl}/courses/${courseId}/files/${fileId}`, { method: 'DELETE', headers: authHeaders() });
    load();
  };

  return (
    <AdminLayout title="Edit Course">
      <FeatureGate featureKey="course-management">
        <div className="max-w-3xl space-y-10">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-900">{course.title}</h1>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={togglePublish}>
                {course.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
              </Button>
              <Button variant="ghost" onClick={deleteCourse} className="text-red-600 hover:bg-red-50">
                Delete Course
              </Button>
            </div>
          </div>

          <form className="space-y-5" onSubmit={saveMeta} noValidate>
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
              id="coverImageUrl"
              label="Cover Image URL"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://..."
            />
            {error && (
              <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                {error}
              </Alert>
            )}
            <Button type="submit" isLoading={savingMeta} loadingLabel="Saving...">
              Save Changes
            </Button>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Lessons</h2>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
            <Reorder.Group axis="y" values={lessons} onReorder={setLessons}>
              {lessons.map((lesson) => (
                <Reorder.Item key={lesson.id} value={lesson} onDragEnd={persistLessonOrder} className="bg-white">
                  <div className="flex items-center px-4 py-3 hover:bg-slate-50">
                    <div className="w-8 shrink-0 text-slate-300 cursor-grab active:cursor-grabbing select-none">⠿</div>
                    <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-100 mr-3">
                      {lesson.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={lesson.coverImageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon name="video" className="h-5 w-5 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="font-medium text-slate-900 truncate">{lesson.title}</p>
                      <p className="text-xs text-slate-400">{formatDuration(lesson.durationSeconds) ?? '--:--'}</p>
                    </div>
                    <span
                      className={`mr-3 rounded-full px-2 py-0.5 text-xs font-medium ${
                        lesson.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {lesson.status}
                    </span>
                    <button
                      type="button"
                      className="mr-3 text-slate-400 hover:text-slate-700"
                      onClick={() => setExpandedLessonId(expandedLessonId === lesson.id ? null : lesson.id)}
                    >
                      <Icon name={expandedLessonId === lesson.id ? 'chevrons-left' : 'cog'} className="h-4 w-4" />
                    </button>
                  </div>
                  {expandedLessonId === lesson.id && (
                    <LessonEditor
                      courseId={courseId}
                      lesson={lesson}
                      onTogglePublish={() => toggleLessonPublish(lesson)}
                      onDelete={() => deleteLesson(lesson.id)}
                      onSaved={load}
                    />
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>
            {lessons.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No lessons yet.</p>}
          </div>

          <form className="flex flex-wrap items-end gap-3" onSubmit={addLesson}>
            <div className="flex-1 min-w-[180px]">
              <Input
                id="newLessonTitle"
                label="New lesson title"
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="newLessonVideoType">
                Video
              </label>
              <select
                id="newLessonVideoType"
                value={newLessonVideoType}
                onChange={(e) => setNewLessonVideoType(e.target.value as 'UPLOAD' | 'EXTERNAL_LINK')}
                className="rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-slate-900"
              >
                <option value="EXTERNAL_LINK">External link</option>
                <option value="UPLOAD">Upload later</option>
              </select>
            </div>
            {newLessonVideoType === 'EXTERNAL_LINK' && (
              <div className="flex-1 min-w-[220px]">
                <Input
                  id="newLessonVideoUrl"
                  label="Video URL"
                  value={newLessonVideoUrl}
                  onChange={(e) => setNewLessonVideoUrl(e.target.value)}
                  placeholder="https://vimeo.com/..."
                />
              </div>
            )}
            <Button type="submit">Add Lesson</Button>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Files</h2>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
            {course.files.map((file) => (
              <div key={file.id} className="flex items-center px-4 py-3">
                <Icon name="file" className="h-4 w-4 mr-3 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-slate-900">{file.fileName}</p>
                  <p className="text-xs text-slate-400">{formatSize(file.sizeBytes)}</p>
                </div>
                <button type="button" className="text-red-500 hover:text-red-700" onClick={() => deleteFile(file.id)}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
            {course.files.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No files yet.</p>}
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-teal-700">
            <Icon name="upload" className="h-4 w-4" />
            Upload a file
            <input type="file" className="hidden" onChange={uploadFile} />
          </label>
        </div>
        </div>
      </FeatureGate>
    </AdminLayout>
  );
}

function LessonEditor({
  courseId,
  lesson,
  onTogglePublish,
  onDelete,
  onSaved,
}: {
  courseId: string;
  lesson: Lesson;
  onTogglePublish: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [coverImageUrl, setCoverImageUrl] = useState(lesson.coverImageUrl ?? '');
  const [duration, setDuration] = useState(formatDuration(lesson.durationSeconds) ?? '');
  const [durationError, setDurationError] = useState('');
  const [videoType, setVideoType] = useState(lesson.videoType);
  const [videoUrl, setVideoUrl] = useState(lesson.videoType === 'EXTERNAL_LINK' ? lesson.videoUrl ?? '' : '');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const durationSeconds = duration.trim() ? parseDuration(duration) : null;
    if (duration.trim() && durationSeconds == null) {
      setDurationError('Use mm:ss or h:mm:ss, e.g. 24:38');
      return;
    }
    setDurationError('');
    setSaving(true);
    await fetch(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, coverImageUrl: coverImageUrl || null, durationSeconds }),
    });

    if (videoType === 'EXTERNAL_LINK' && videoUrl) {
      const formData = new FormData();
      formData.append('videoType', 'EXTERNAL_LINK');
      formData.append('videoUrl', videoUrl);
      await fetch(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}/video`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
    } else if (videoType === 'UPLOAD' && videoFile) {
      const formData = new FormData();
      formData.append('videoType', 'UPLOAD');
      formData.append('file', videoFile);
      await fetch(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}/video`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
    }

    setSaving(false);
    onSaved();
  };

  return (
    <form className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4" onSubmit={save}>
      <Input id={`lesson-title-${lesson.id}`} label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input
        id={`lesson-cover-${lesson.id}`}
        label="Cover Image URL"
        value={coverImageUrl}
        onChange={(e) => setCoverImageUrl(e.target.value)}
      />
      <Input
        id={`lesson-duration-${lesson.id}`}
        label="Duration"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        placeholder="mm:ss, e.g. 24:38"
        error={durationError}
      />
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Video</label>
        <div className="flex items-center gap-4 mb-2 text-sm text-slate-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={videoType === 'EXTERNAL_LINK'}
              onChange={() => setVideoType('EXTERNAL_LINK')}
            />
            External link
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={videoType === 'UPLOAD'} onChange={() => setVideoType('UPLOAD')} />
            Upload
          </label>
        </div>
        {videoType === 'EXTERNAL_LINK' ? (
          <Input
            id={`lesson-video-url-${lesson.id}`}
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://vimeo.com/..."
          />
        ) : (
          <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={saving} loadingLabel="Saving...">
          Save Lesson
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onTogglePublish}>
          {lesson.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete} className="text-red-600 hover:bg-red-50">
          Delete Lesson
        </Button>
      </div>
    </form>
  );
}
