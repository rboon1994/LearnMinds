'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Reorder } from 'framer-motion';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { FileUpload } from '@/components/ui/FileUpload';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { formatDuration, parseDuration } from '@/lib/duration';
import { fetchVimeoDuration } from '@/lib/vimeo';

type Lesson = {
  id: string;
  title: string;
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
  thumbnail: string | null;
  startDate: string | null;
  endDate: string | null;
  seriesId: string | null;
  speakers: { id: string; name: string }[];
  whatsappNumber: string | null;
  whatsappMessage: string | null;
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

async function autofillDurationFromVimeo(url: string, setDuration: (value: string) => void) {
  const seconds = await fetchVimeoDuration(url);
  if (seconds != null) setDuration(formatDuration(seconds) ?? '');
}

// Resolves the final duration text (auto-filling from Vimeo first when requested), then parses it.
async function resolveDurationSeconds(shouldAutofillFromVimeo: boolean, videoUrl: string, durationInput: string) {
  let resolved = durationInput;
  if (shouldAutofillFromVimeo) {
    const seconds = await fetchVimeoDuration(videoUrl);
    if (seconds != null) resolved = formatDuration(seconds) ?? resolved;
  }
  const durationSeconds = resolved.trim() ? parseDuration(resolved) : null;
  if (resolved.trim() && durationSeconds == null) {
    return { durationSeconds: null, error: 'Use mm:ss or h:mm:ss, e.g. 24:38' };
  }
  return { durationSeconds, error: null };
}

export default function EditCoursePage() {
  const { user } = useAuth();
  const toast = useToast();
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
  const [thumbnail, setThumbnail] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<{ type: 'course' | 'lesson' | 'file'; id?: string } | null>(
    null,
  );
  const [seriesId, setSeriesId] = useState('');
  const [seriesOptions, setSeriesOptions] = useState<{ value: string; label: string }[]>([]);
  const [speakerIds, setSpeakerIds] = useState<string[]>([]);
  const [speakerOptions, setSpeakerOptions] = useState<{ value: string; label: string }[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [isAddLessonOpen, setIsAddLessonOpen] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonVideoType, setNewLessonVideoType] = useState<'UPLOAD' | 'EXTERNAL_LINK'>('EXTERNAL_LINK');
  const [newLessonVideoUrl, setNewLessonVideoUrl] = useState('');
  const [newLessonDuration, setNewLessonDuration] = useState('');
  const [newLessonDurationError, setNewLessonDurationError] = useState('');

  const load = () => {
    fetch(`${apiUrl}/courses/${courseId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Course) => {
        setCourse(data);
        setLessons(data.lessons);
        setTitle(data.title);
        setDescription(data.description ?? '');
        setThumbnail(data.thumbnail ?? '');
        setStartDate(data.startDate?.slice(0, 10) ?? '');
        setEndDate(data.endDate?.slice(0, 10) ?? '');
        setSeriesId(data.seriesId ?? '');
        setSpeakerIds(data.speakers.map((s) => s.id));
        setWhatsappNumber(data.whatsappNumber ?? '');
        setWhatsappMessage(data.whatsappMessage ?? '');
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
    if (user.role === 'SUPER_ADMIN') {
      fetch(`${apiUrl}/course-series`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((data: { id: string; name: string }[]) =>
          setSeriesOptions(data.map((s) => ({ value: s.id, label: s.name }))),
        )
        .catch(() => {});
      fetch(`${apiUrl}/speakers?pageSize=1000`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((res: { data: { id: string; name: string }[] }) =>
          setSpeakerOptions(res.data.map((s) => ({ value: s.id, label: s.name }))),
        )
        .catch(() => {});
    }
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
      body: JSON.stringify({
        title,
        description: description || null,
        thumbnail: thumbnail || null,
        startDate: startDate || null,
        endDate: endDate || null,
        seriesId: seriesId || null,
        speakerIds,
        whatsappNumber: whatsappNumber || null,
        whatsappMessage: whatsappMessage || null,
      }),
    });
    setSavingMeta(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    load();
  };

  const toggleStatus = async (url: string, currentStatus: 'DRAFT' | 'PUBLISHED') => {
    const status = currentStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    await fetch(url, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const deleteResource = async (url: string, onSuccess: () => void) => {
    const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    onSuccess();
  };

  const togglePublish = () => toggleStatus(`${apiUrl}/courses/${courseId}`, course.status);

  const deleteCourse = () => deleteResource(`${apiUrl}/courses/${courseId}`, () => router.push('/admin/courses'));

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
    const { durationSeconds, error: durationError } = await resolveDurationSeconds(
      newLessonVideoType === 'EXTERNAL_LINK',
      newLessonVideoUrl,
      newLessonDuration,
    );
    if (durationError) {
      setNewLessonDurationError(durationError);
      return;
    }
    setNewLessonDurationError('');
    const res = await fetch(`${apiUrl}/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newLessonTitle,
        videoType: newLessonVideoType,
        videoUrl: newLessonVideoType === 'EXTERNAL_LINK' ? newLessonVideoUrl : undefined,
        durationSeconds,
      }),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    resetNewLessonForm();
    setIsAddLessonOpen(false);
    load();
  };

  const resetNewLessonForm = () => {
    setNewLessonTitle('');
    setNewLessonVideoType('EXTERNAL_LINK');
    setNewLessonVideoUrl('');
    setNewLessonDuration('');
    setNewLessonDurationError('');
  };

  const closeAddLessonDialog = () => {
    setIsAddLessonOpen(false);
    resetNewLessonForm();
  };

  const deleteLesson = (lessonId: string) => deleteResource(`${apiUrl}/courses/${courseId}/lessons/${lessonId}`, load);

  const toggleLessonPublish = (lesson: Lesson) =>
    toggleStatus(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}`, lesson.status);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${apiUrl}/courses/${courseId}/files`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) {
        toast.saveFailed();
        return;
      }
    } catch {
      toast.saveFailed();
      return;
    }
    toast.saved();
    load();
  };

  const deleteFile = (fileId: string) => deleteResource(`${apiUrl}/courses/${courseId}/files/${fileId}`, load);

  return (
    <AdminLayout
      title="Edit Course"
      backHref="/admin/courses"
      subtitle={course.title}
      actions={
        <>
          <Button variant="secondary" onClick={togglePublish}>
            {course.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmDelete({ type: 'course' })}
            leftIcon={<Icon name="trash" className="h-4 w-4 mr-1.5" />}
          >
            Delete
          </Button>
        </>
      }
    >
      <FeatureGate featureKey="course-management">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="order-2 lg:order-1 lg:col-span-2 space-y-10">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Lessons</h2>
            <Button
              leftIcon={<Icon name="plus" className="h-4 w-4 mr-1.5" />}
              onClick={() => setIsAddLessonOpen(true)}
              size="sm"
              variant="secondary"
            >
              Add
            </Button>
          </div>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4 max-h-102 overflow-y-auto">
            <Reorder.Group axis="y" values={lessons} onReorder={setLessons}>
              {lessons.map((lesson) => (
                <Reorder.Item key={lesson.id} value={lesson} onDragEnd={persistLessonOrder} className="bg-white">
                  <div className="flex items-center px-4 py-3 hover:bg-slate-50">
                    <div className="w-8 shrink-0 text-slate-300 cursor-grab active:cursor-grabbing select-none">⠿</div>
                    <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-100 mr-3 flex items-center justify-center">
                      <Icon name="video" className="h-5 w-5 text-slate-300" />
                    </div>
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="font-medium text-slate-900 truncate">{lesson.title}</p>
                      <p className="text-xs text-slate-400">{formatDuration(lesson.durationSeconds) ?? '--:--'}</p>
                    </div>
                    <div className="mr-3">
                      <StatusBadge status={lesson.status} onClick={() => toggleLessonPublish(lesson)} />
                    </div>
                    <button
                      type="button"
                      className="mr-3 text-slate-400 hover:text-slate-700"
                      onClick={() => setExpandedLessonId(expandedLessonId === lesson.id ? null : lesson.id)}
                    >
                      <Icon name={expandedLessonId === lesson.id ? 'chevrons-left' : 'edit'} className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setConfirmDelete({ type: 'lesson', id: lesson.id })}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                  {expandedLessonId === lesson.id && (
                    <LessonEditor courseId={courseId} lesson={lesson} onSaved={load} />
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>
            {lessons.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No lessons yet.</p>}
          </div>

          <Dialog isOpen={isAddLessonOpen} onClose={closeAddLessonDialog} title="Create New Lesson">
            <form className="space-y-4" onSubmit={addLesson}>
              <Input
                id="newLessonTitle"
                label="Title"
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
              />
              <Input
                id="newLessonDuration"
                label="Duration"
                value={newLessonDuration}
                onChange={(e) => setNewLessonDuration(e.target.value)}
                placeholder="hh:mm:ss, e.g. 1:24:38"
                error={newLessonDurationError}
              />
              <RadioGroup
                className="hidden"
                label="Video"
                name="newLessonVideoType"
                onChange={(value) => setNewLessonVideoType(value as 'UPLOAD' | 'EXTERNAL_LINK')}
                options={[
                  { label: 'External link', value: 'EXTERNAL_LINK' },
                  { label: 'Upload later', value: 'UPLOAD' },
                ]}
                value={newLessonVideoType}
              />
              {newLessonVideoType === 'EXTERNAL_LINK' && (
                <Input
                  id="newLessonVideoUrl"
                  label="Video URL"
                  value={newLessonVideoUrl}
                  onChange={(e) => setNewLessonVideoUrl(e.target.value)}
                  onBlur={(e) => autofillDurationFromVimeo(e.target.value, setNewLessonDuration)}
                  placeholder="Paste Vimeo URL"
                />
              )}
              <Button type="submit">Create Lesson</Button>
            </form>
          </Dialog>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Files</h2>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4 max-h-50 overflow-y-auto">
            {course.files.map((file) => (
              <div key={file.id} className="flex items-center px-4 py-3">
                <Icon name="file" className="h-4 w-4 mr-3 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-slate-900">{file.fileName}</p>
                  <p className="text-xs text-slate-400">{formatSize(file.sizeBytes)}</p>
                </div>
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => setConfirmDelete({ type: 'file', id: file.id })}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
            {course.files.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No files yet.</p>}
          </div>
          <FileUpload
            key={course.files.length}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md"
            acceptLabel="PDF, Word, Excel, PowerPoint, CSV, TXT, MD · Max 15MB"
            id="courseFile"
            maxSizeBytes={15 * 1024 * 1024}
            onFilesSelected={([file]) => file && uploadFile(file)}
          />
        </div>

        </div>

        <div className="order-1 lg:order-2 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Course</h2>
          <form className="space-y-5" onSubmit={saveMeta} noValidate>
            <Input id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Textarea
              id="description"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
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
            {isSuperAdmin && (
              <SearchableSelect
                id="seriesId"
                label="Course Series"
                onChange={setSeriesId}
                options={seriesOptions}
                placeholder="No series"
                value={seriesId}
              />
            )}
            {isSuperAdmin && (
              <SearchableSelect
                id="speakerIds"
                label="Speaker"
                multiple
                onChange={setSpeakerIds}
                options={speakerOptions}
                placeholder="No speaker"
                value={speakerIds}
              />
            )}
            {isSuperAdmin && (
              <Input
                id="whatsappNumber"
                label="WhatsApp Number"
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. 60123456789"
                value={whatsappNumber}
              />
            )}
            {isSuperAdmin && (
              <Textarea
                id="whatsappMessage"
                label="WhatsApp Message"
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Pre-filled message sent when a student taps Contact via WhatsApp"
                rows={3}
                value={whatsappMessage}
              />
            )}
            {error && (
              <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                {error}
              </Alert>
            )}
            <Button type="submit" isLoading={savingMeta} loadingLabel="Saving...">
              Save
            </Button>
          </form>
        </div>
        </div>

        <ConfirmDeleteDialog
          isOpen={confirmDelete !== null}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete?.type === 'course') deleteCourse();
            if (confirmDelete?.type === 'lesson' && confirmDelete.id) deleteLesson(confirmDelete.id);
            if (confirmDelete?.type === 'file' && confirmDelete.id) deleteFile(confirmDelete.id);
          }}
          title={
            confirmDelete?.type === 'course'
              ? 'Delete Course'
              : confirmDelete?.type === 'lesson'
                ? 'Delete Lesson'
                : 'Delete File'
          }
          userEmail={user?.email ?? ''}
        />
      </FeatureGate>
    </AdminLayout>
  );
}

function LessonEditor({
  courseId,
  lesson,
  onSaved,
}: {
  courseId: string;
  lesson: Lesson;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [duration, setDuration] = useState(formatDuration(lesson.durationSeconds) ?? '');
  const [durationError, setDurationError] = useState('');
  const [videoType, setVideoType] = useState(lesson.videoType);
  const [videoUrl, setVideoUrl] = useState(lesson.videoType === 'EXTERNAL_LINK' ? lesson.videoUrl ?? '' : '');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const { durationSeconds, error: durationErrorMessage } = await resolveDurationSeconds(
      videoType === 'EXTERNAL_LINK' && Boolean(videoUrl),
      videoUrl,
      duration,
    );
    if (durationErrorMessage) {
      setDurationError(durationErrorMessage);
      return;
    }
    setDurationError('');
    setSaving(true);
    const results = [
      await fetch(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, durationSeconds }),
      }),
    ];

    if (videoType === 'EXTERNAL_LINK' && videoUrl) {
      const formData = new FormData();
      formData.append('videoType', 'EXTERNAL_LINK');
      formData.append('videoUrl', videoUrl);
      results.push(
        await fetch(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}/video`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
        }),
      );
    } else if (videoType === 'UPLOAD' && videoFile) {
      const formData = new FormData();
      formData.append('videoType', 'UPLOAD');
      formData.append('file', videoFile);
      results.push(
        await fetch(`${apiUrl}/courses/${courseId}/lessons/${lesson.id}/video`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
        }),
      );
    }

    setSaving(false);
    if (results.some((res) => !res.ok)) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    onSaved();
  };

  return (
    <form className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4" onSubmit={save}>
      <Input id={`lesson-title-${lesson.id}`} label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input
        id={`lesson-duration-${lesson.id}`}
        label="Duration"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        placeholder="hh:mm:ss, e.g. 1:24:38"
        error={durationError}
      />
      <div className="space-y-2">
        <RadioGroup
          className="hidden"
          label="Video"
          name={`lesson-video-type-${lesson.id}`}
          onChange={(value) => setVideoType(value as 'UPLOAD' | 'EXTERNAL_LINK')}
          options={[
            { label: 'External link', value: 'EXTERNAL_LINK' },
            { label: 'Upload', value: 'UPLOAD' },
          ]}
          value={videoType}
        />
        {videoType === 'EXTERNAL_LINK' ? (
          <Input
            id={`lesson-video-url-${lesson.id}`}
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onBlur={(e) => autofillDurationFromVimeo(e.target.value, setDuration)}
            placeholder="https://vimeo.com/..."
          />
        ) : (
          <FileUpload
            accept="video/*"
            id={`lesson-video-file-${lesson.id}`}
            onFilesSelected={([file]) => setVideoFile(file ?? null)}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={saving} loadingLabel="Saving...">
          Save
        </Button>
      </div>
    </form>
  );
}
