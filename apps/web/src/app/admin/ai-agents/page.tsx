'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AgentChatHistoryDialog } from '@/components/admin/AgentChatHistoryDialog';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import type { SelectOption } from '@/components/ui/SearchableSelect';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

type AiAgentModel = {
  id: string;
  modelId: string;
  displayName: string;
  maxTokenLimit: number;
  inputTokenPrice: number;
  outputTokenPrice: number;
  temperature: number;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
};

type AiAgent = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  instructions: string | null;
  thumbnail: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  model: { id: string; displayName: string };
  series: { id: string; name: string } | null;
  creator: { id: string; name: string } | null;
  knowledgeBase: { id: string; name: string } | null;
};

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];

const emptyModelForm = {
  modelId: '',
  displayName: '',
  maxTokenLimit: '',
  inputTokenPrice: '',
  outputTokenPrice: '',
  temperature: '0.7',
};

const emptyAgentForm = {
  name: '',
  description: '',
  systemPrompt: '',
  instructions: '',
  thumbnail: '',
  modelId: '',
  seriesId: '',
  creatorId: '',
  knowledgeBaseId: '',
};

export default function AdminAiAgentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [searchName, setSearchName] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  // Manage AI Agent Model dialog
  const [isModelsOpen, setIsModelsOpen] = useState(false);
  const [models, setModels] = useState<AiAgentModel[]>([]);
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelFormError, setModelFormError] = useState('');
  const [deletingModel, setDeletingModel] = useState<AiAgentModel | null>(null);

  // Course Series options (shown in full, not filtered by enrollment)
  const [seriesOptions, setSeriesOptions] = useState<SelectOption[]>([]);
  // Knowledge Base options — reusable across agents, so shown in full like Course Series.
  const [knowledgeBaseOptions, setKnowledgeBaseOptions] = useState<SelectOption[]>([]);
  // Creator (Speaker) options, server-searched
  const [creatorOptions, setCreatorOptions] = useState<SelectOption[]>([]);
  // Model options for the Create/Edit Agent dropdown (ACTIVE only, + the agent's own model on edit)
  const [agentModelOptions, setAgentModelOptions] = useState<{ options: SelectOption[]; models: AiAgentModel[] }>({
    options: [],
    models: [],
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyAgentForm);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [chatHistoryAgent, setChatHistoryAgent] = useState<AiAgent | null>(null);

  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null);
  const [editForm, setEditForm] = useState(emptyAgentForm);
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchAgents = () => {
    if (!localStorage.getItem('token')) return;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    fetch(`${apiUrl}/ai-agents?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: AiAgent[]; total: number }) => {
        setAgents(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  };

  const loadModels = () => {
    fetch(`${apiUrl}/ai-agent-models`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setModels)
      .catch(() => {});
  };

  const loadSeriesOptions = () => {
    fetch(`${apiUrl}/course-series`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { id: string; name: string }[]) => setSeriesOptions(res.map((s) => ({ value: s.id, label: s.name }))))
      .catch(() => {});
  };

  const loadKnowledgeBaseOptions = () => {
    fetch(`${apiUrl}/knowledge-bases`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { id: string; name: string }[]) =>
        setKnowledgeBaseOptions(res.map((kb) => ({ value: kb.id, label: kb.name }))),
      )
      .catch(() => {});
  };

  const searchCreators = (query: string) => {
    fetch(`${apiUrl}/speakers?search=${encodeURIComponent(query)}&pageSize=20`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: { id: string; name: string }[] }) =>
        setCreatorOptions(res.data.map((s) => ({ value: s.id, label: s.name }))),
      )
      .catch(() => {});
  };

  // includeId keeps a since-deactivated model visible/selectable on the Edit dialog even
  // though it's no longer offered to new agents — otherwise the SearchableSelect has no
  // matching option for the agent's current modelId and the field renders blank.
  const loadAgentModelOptions = (includeId?: string) => {
    const params = new URLSearchParams({ status: 'ACTIVE' });
    if (includeId) params.set('includeId', includeId);
    fetch(`${apiUrl}/ai-agent-models?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: AiAgentModel[]) =>
        setAgentModelOptions({ options: res.map((m) => ({ value: m.id, label: m.displayName })), models: res }),
      )
      .catch(() => {});
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchName.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchName]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }
    fetchAgents();
    loadSeriesOptions();
    loadKnowledgeBaseOptions();
    searchCreators('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, page, debouncedSearch, statusFilter]);

  const columns: AdminTableColumn<AiAgent>[] = [
    { header: 'Name', className: 'font-medium text-slate-900', render: (agent) => agent.name },
    { header: 'Model', render: (agent) => agent.model.displayName },
    { header: 'Course Series', render: (agent) => agent.series?.name ?? '—' },
    { header: 'Creator', render: (agent) => agent.creator?.name ?? '—' },
    {
      header: 'Status',
      // Read-only here — the row itself opens the Edit dialog on click, so a second clickable
      // target in the same row would fight it (AdminTable's onRowClick sits on the whole <tr>,
      // with no stopPropagation). Toggling status happens from inside the Edit dialog instead.
      render: (agent) => <StatusBadge status={agent.status} />,
    },
    {
      header: 'Chat History',
      render: (agent) => (
        <button
          type="button"
          // stopPropagation: the row itself already opens the Edit dialog on click (see the
          // Status column comment above) — same pattern as users/page.tsx's "User Log" button.
          onClick={(e) => {
            e.stopPropagation();
            setChatHistoryAgent(agent);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          aria-label={`View chat history for ${agent.name}`}
        >
          <Icon name="eye" className="h-3.5 w-3.5" />
          View
        </button>
      ),
    },
  ];

  // Lives only in the Edit dialog now, not the table row (see the Status column above) —
  // also keeps `editingAgent` itself in sync so the badge reflects the new status immediately
  // without closing/reopening the dialog.
  const toggleAgentStatus = async (agent: AiAgent) => {
    const status = agent.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const res = await fetch(`${apiUrl}/ai-agents/${agent.id}/status`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    setEditingAgent((prev) => (prev && prev.id === agent.id ? { ...prev, status } : prev));
    fetchAgents();
  };

  // -- Manage AI Agent Model dialog --

  const openModelsDialog = () => {
    setIsModelsOpen(true);
    loadModels();
  };

  const closeModelsDialog = () => {
    setIsModelsOpen(false);
    setModelForm(emptyModelForm);
    setEditingModelId(null);
    setModelFormError('');
  };

  const startEditModel = (model: AiAgentModel) => {
    setEditingModelId(model.id);
    setModelForm({
      modelId: model.modelId,
      displayName: model.displayName,
      maxTokenLimit: String(model.maxTokenLimit),
      inputTokenPrice: String(model.inputTokenPrice),
      outputTokenPrice: String(model.outputTokenPrice),
      temperature: String(model.temperature),
    });
    setModelFormError('');
  };

  const cancelEditModel = () => {
    setEditingModelId(null);
    setModelForm(emptyModelForm);
    setModelFormError('');
  };

  const submitModelForm = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!modelForm.modelId.trim() || !modelForm.displayName.trim()) {
      setModelFormError('Model ID and Display Name are required');
      return;
    }
    // Number('') is 0, not "empty" — checking the raw string first (not the parsed number)
    // means a cleared field is rejected as missing input instead of silently becoming 0.
    if (
      modelForm.maxTokenLimit.trim() === '' ||
      modelForm.inputTokenPrice.trim() === '' ||
      modelForm.outputTokenPrice.trim() === ''
    ) {
      setModelFormError('Max Token Limit, Input Price and Output Price are required');
      return;
    }
    const body = {
      modelId: modelForm.modelId,
      displayName: modelForm.displayName,
      maxTokenLimit: Number(modelForm.maxTokenLimit),
      inputTokenPrice: Number(modelForm.inputTokenPrice),
      outputTokenPrice: Number(modelForm.outputTokenPrice),
      // '' !== undefined check, not a truthy check — Temperature 0 is valid and must not
      // be silently replaced by the 0.7 default.
      temperature: modelForm.temperature === '' ? undefined : Number(modelForm.temperature),
    };
    const url = editingModelId ? `${apiUrl}/ai-agent-models/${editingModelId}` : `${apiUrl}/ai-agent-models`;
    const res = await fetch(url, {
      method: editingModelId ? 'PATCH' : 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setModelFormError(data?.message ?? 'Failed to save model');
      return;
    }
    toast.saved();
    cancelEditModel();
    loadModels();
  };

  const toggleModelStatus = async (model: AiAgentModel) => {
    const status = model.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await fetch(`${apiUrl}/ai-agent-models/${model.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      // 400 here is the "can't deactivate the default model" guardrail — a business-rule
      // block by design, not a hard failure, so it reads as a warning rather than an error.
      if (res.status === 400 && data?.message) {
        toast.warning(data.message);
      } else {
        toast.saveFailed();
      }
      return;
    }
    loadModels();
  };

  const setDefaultModel = async (model: AiAgentModel) => {
    const res = await fetch(`${apiUrl}/ai-agent-models/${model.id}/default`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    loadModels();
  };

  const deleteModel = async () => {
    if (!deletingModel) return;
    const res = await fetch(`${apiUrl}/ai-agent-models/${deletingModel.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      // 400 here is the "can't delete the default model" guardrail — same warning treatment
      // as toggleModelStatus above. A 409 (agents still reference this model) stays an error.
      if (res.status === 400 && data?.message) {
        toast.warning(data.message);
      } else {
        toast.deleteFailed();
        if (data?.message) alert(data.message);
      }
      return;
    }
    toast.deleted();
    loadModels();
  };

  // -- Create Agent dialog --

  const openCreateDialog = () => {
    setIsCreateOpen(true);
    fetch(`${apiUrl}/ai-agent-models?status=ACTIVE`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: AiAgentModel[]) => {
        setAgentModelOptions({ options: res.map((m) => ({ value: m.id, label: m.displayName })), models: res });
        // Auto-select the current default model instead of leaving the field empty.
        const defaultModel = res.find((m) => m.isDefault);
        if (defaultModel) setCreateForm((f) => ({ ...f, modelId: defaultModel.id }));
      })
      .catch(() => {});
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateForm(emptyAgentForm);
    setCreateError('');
  };

  const createAgent = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.systemPrompt.trim() || !createForm.modelId) {
      setCreateError('Name, System Prompt and Model are required');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/ai-agents`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createForm.name,
        description: createForm.description || undefined,
        systemPrompt: createForm.systemPrompt,
        instructions: createForm.instructions || undefined,
        thumbnail: createForm.thumbnail || undefined,
        modelId: createForm.modelId,
        seriesId: createForm.seriesId || null,
        creatorId: createForm.creatorId || null,
        knowledgeBaseId: createForm.knowledgeBaseId || null,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      setCreateError('Failed to create agent');
      return;
    }
    toast.saved();
    closeCreateDialog();
    fetchAgents();
  };

  // -- Edit Agent dialog --

  const openEditDialog = (agent: AiAgent) => {
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      description: agent.description ?? '',
      systemPrompt: agent.systemPrompt,
      instructions: agent.instructions ?? '',
      thumbnail: agent.thumbnail ?? '',
      modelId: agent.model.id,
      seriesId: agent.series?.id ?? '',
      creatorId: agent.creator?.id ?? '',
      knowledgeBaseId: agent.knowledgeBase?.id ?? '',
    });
    setEditError('');
    loadAgentModelOptions(agent.model.id);
    if (agent.creator) {
      setCreatorOptions((prev) =>
        prev.some((o) => o.value === agent.creator!.id)
          ? prev
          : [{ value: agent.creator!.id, label: agent.creator!.name }, ...prev],
      );
    }
  };

  const closeEditDialog = () => {
    setEditingAgent(null);
    setConfirmDelete(false);
  };

  const saveAgent = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!editingAgent) return;
    if (!editForm.name.trim() || !editForm.systemPrompt.trim() || !editForm.modelId) {
      setEditError('Name, System Prompt and Model are required');
      return;
    }
    setIsSaving(true);
    setEditError('');
    const res = await fetch(`${apiUrl}/ai-agents/${editingAgent.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        systemPrompt: editForm.systemPrompt,
        instructions: editForm.instructions || null,
        thumbnail: editForm.thumbnail || null,
        modelId: editForm.modelId,
        seriesId: editForm.seriesId || null,
        creatorId: editForm.creatorId || null,
        knowledgeBaseId: editForm.knowledgeBaseId || null,
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.saved();
    closeEditDialog();
    fetchAgents();
  };

  // Genuine hard delete (advanced cleanup) — distinct from the everyday StatusBadge toggle above.
  const deleteAgentPermanently = async () => {
    if (!editingAgent) return;
    const res = await fetch(`${apiUrl}/ai-agents/${editingAgent.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    closeEditDialog();
    fetchAgents();
  };

  if (user && user.role !== 'SUPER_ADMIN') return null;

  const renderAgentFields = (
    form: typeof emptyAgentForm,
    setForm: (updater: (f: typeof emptyAgentForm) => typeof emptyAgentForm) => void,
    idPrefix: string,
  ) => (
    <>
      <Input
        autoFocus
        id={`${idPrefix}Name`}
        label="Name"
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        required
        value={form.name}
      />
      <Textarea
        id={`${idPrefix}Description`}
        label="Description"
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        rows={2}
        value={form.description}
      />
      <Textarea
        id={`${idPrefix}SystemPrompt`}
        label="System Prompt"
        onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
        required
        rows={5}
        value={form.systemPrompt}
      />
      <Textarea
        id={`${idPrefix}Instructions`}
        label="Instructions"
        helperText="Shown to end users in Chat to explain how to use this agent"
        onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
        rows={3}
        value={form.instructions}
      />
      <Input
        id={`${idPrefix}Thumbnail`}
        label="Thumbnail"
        onChange={(e) => setForm((f) => ({ ...f, thumbnail: e.target.value }))}
        placeholder="https://..."
        value={form.thumbnail}
      />
      <SearchableSelect
        id={`${idPrefix}ModelId`}
        label="Model"
        onChange={(value) => setForm((f) => ({ ...f, modelId: value }))}
        options={agentModelOptions.options}
        placeholder="Select a model"
        required
        value={form.modelId}
      />
      <SearchableSelect
        id={`${idPrefix}SeriesId`}
        label="Course Series"
        onChange={(value) => setForm((f) => ({ ...f, seriesId: value }))}
        options={seriesOptions}
        placeholder="No series"
        value={form.seriesId}
      />
      <SearchableSelect
        id={`${idPrefix}CreatorId`}
        label="Creator"
        onChange={(value) => setForm((f) => ({ ...f, creatorId: value }))}
        onQueryChange={searchCreators}
        options={creatorOptions}
        placeholder="No creator"
        value={form.creatorId}
      />
      <SearchableSelect
        id={`${idPrefix}KnowledgeBaseId`}
        label="Knowledge Base"
        onChange={(value) => setForm((f) => ({ ...f, knowledgeBaseId: value }))}
        options={knowledgeBaseOptions}
        placeholder="No knowledge base"
        value={form.knowledgeBaseId}
      />
    </>
  );

  return (
    <AdminLayout
      title="AI Agents"
      backHref="/admin"
      actions={
        <>
          <Button variant="secondary" onClick={openModelsDialog}>
            Manage AI Agent Model
          </Button>
          <Button onClick={openCreateDialog} variant="gradient">
            Create New AI Agent
          </Button>
        </>
      }
    >
      <FeatureGate featureKey="ai-agent-management">
        <AdminTable
          columns={columns}
          data={agents}
          keyField="id"
          onRowClick={openEditDialog}
          emptyMessage={total === 0 && !debouncedSearch && !statusFilter ? 'No AI agents yet.' : 'No agents match your filters.'}
          pagination={{ page, pageSize, total, onPageChange: setPage }}
          toolbar={
            <>
              <div className="flex-1 min-w-50">
                <Input
                  id="searchName"
                  onChange={(e) => {
                    setSearchName(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name..."
                  value={searchName}
                />
              </div>
              <div className="w-full sm:w-48">
                <SearchableSelect
                  id="statusFilter"
                  onChange={(value) => {
                    setStatusFilter(value);
                    setPage(1);
                  }}
                  options={STATUS_OPTIONS}
                  placeholder="All statuses"
                  value={statusFilter}
                />
              </div>
            </>
          }
        />
      </FeatureGate>

      {/* Manage AI Agent Model */}
      <Dialog isOpen={isModelsOpen} onClose={closeModelsDialog} title="AI Agent Models" size="xl">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {models.map((model) => (
              <div key={model.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {model.displayName} <span className="text-slate-400 font-normal">({model.modelId})</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {model.maxTokenLimit.toLocaleString()} max tokens · ${model.inputTokenPrice}/${model.outputTokenPrice} per 1M in/out · temp {model.temperature}
                  </p>
                </div>
                <button
                  type="button"
                  title={model.isDefault ? 'Default model' : 'Set as default'}
                  className={model.isDefault ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}
                  onClick={() => setDefaultModel(model)}
                >
                  <Icon name="check-circle" className="h-4 w-4" />
                </button>
                <StatusBadge status={model.status} onClick={() => toggleModelStatus(model)} />
                <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => startEditModel(model)}>
                  <Icon name="edit" className="h-4 w-4" />
                </button>
                <button type="button" className="text-red-500 hover:text-red-700" onClick={() => setDeletingModel(model)}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
            {models.length === 0 && <p className="px-4 py-6 text-center text-slate-400">No models yet.</p>}
          </div>
          <form className="grid grid-cols-2 gap-3" onSubmit={submitModelForm}>
            <Input
              id="modelFormModelId"
              label="Model ID"
              onChange={(e) => setModelForm((f) => ({ ...f, modelId: e.target.value }))}
              placeholder="gpt-4o"
              value={modelForm.modelId}
            />
            <Input
              id="modelFormDisplayName"
              label="Display Name"
              onChange={(e) => setModelForm((f) => ({ ...f, displayName: e.target.value }))}
              value={modelForm.displayName}
            />
            <Input
              id="modelFormMaxTokenLimit"
              label="Max Token Limit"
              onChange={(e) => setModelForm((f) => ({ ...f, maxTokenLimit: e.target.value }))}
              type="number"
              min={1}
              value={modelForm.maxTokenLimit}
            />
            <Input
              id="modelFormTemperature"
              label="Temperature"
              onChange={(e) => setModelForm((f) => ({ ...f, temperature: e.target.value }))}
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={modelForm.temperature}
            />
            <Input
              id="modelFormInputTokenPrice"
              label="Input Price (per 1M tokens)"
              onChange={(e) => setModelForm((f) => ({ ...f, inputTokenPrice: e.target.value }))}
              type="number"
              min={0}
              step={0.01}
              value={modelForm.inputTokenPrice}
            />
            <Input
              id="modelFormOutputTokenPrice"
              label="Output Price (per 1M tokens)"
              onChange={(e) => setModelForm((f) => ({ ...f, outputTokenPrice: e.target.value }))}
              type="number"
              min={0}
              step={0.01}
              value={modelForm.outputTokenPrice}
            />
            {modelFormError && (
              <div className="col-span-2">
                <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
                  {modelFormError}
                </Alert>
              </div>
            )}
            <div className="col-span-2 flex gap-2">
              <Button type="submit">{editingModelId ? 'Save' : 'Add Model'}</Button>
              {editingModelId && (
                <Button type="button" variant="secondary" onClick={cancelEditModel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>
      </Dialog>

      {/* Create New AI Agent */}
      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="Create New AI Agent" size="xl">
        <form className="space-y-5" onSubmit={createAgent} noValidate>
          {renderAgentFields(createForm, setCreateForm, 'create')}
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create AI Agent
          </Button>
        </form>
      </Dialog>

      {/* Edit AI Agent */}
      <Dialog
        isOpen={editingAgent !== null}
        onClose={closeEditDialog}
        title="Edit AI Agent"
        titleExtra={
          editingAgent && (
            <StatusBadge status={editingAgent.status} onClick={() => toggleAgentStatus(editingAgent)} />
          )
        }
        size="xl"
      >
        <form className="space-y-5" onSubmit={saveAgent} noValidate>
          {renderAgentFields(editForm, setEditForm, 'edit')}
          {editError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {editError}
            </Alert>
          )}
          <div className="flex gap-3">
            <Button type="submit" isLoading={isSaving} loadingLabel="Saving...">
              Save
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              leftIcon={<Icon name="trash" className="h-4 w-4 mr-1.5" />}
            >
              Delete Permanently
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDeleteDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteAgentPermanently}
        title="Delete AI Agent Permanently"
        userEmail={user?.email ?? ''}
      />

      <ConfirmDeleteDialog
        isOpen={deletingModel !== null}
        onClose={() => setDeletingModel(null)}
        onConfirm={deleteModel}
        title={`Delete Model "${deletingModel?.displayName ?? ''}"`}
        userEmail={user?.email ?? ''}
      />

      {chatHistoryAgent && (
        <AgentChatHistoryDialog
          agentId={chatHistoryAgent.id}
          agentLabel={chatHistoryAgent.name}
          isOpen
          onClose={() => setChatHistoryAgent(null)}
        />
      )}
    </AdminLayout>
  );
}
