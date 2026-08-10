'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/layout/Navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

type Agent = {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  hasAccess: boolean;
};

export default function AgentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navUserName = user?.fullName ?? '';
  const navUser = { name: navUserName, initials: initials(navUserName), role: user?.role ?? '' };

  useEffect(() => {
    fetch(`${apiUrl}/agent-chat/agents`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => {});
  }, []);

  const filteredAgents = useMemo(() => {
    if (!searchQuery) return agents;
    const q = searchQuery.toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(q));
  }, [agents, searchQuery]);

  const startChat = async (agentId: string) => {
    setStartingId(agentId);
    const res = await fetch(`${apiUrl}/agent-chat/conversations`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    setStartingId(null);
    if (!res.ok) return;
    const conversation: { id: string } = await res.json();
    router.push(`/ai-chat?conversationId=${conversation.id}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Navigation user={navUser} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader
          defaultTitle="AI Agents"
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <SearchInput
                id="agent-search"
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Search…"
              />
            </div>
            <span className="shrink-0 text-xs sm:text-sm text-slate-500 whitespace-nowrap">
              <span className="font-semibold text-slate-900">{filteredAgents.length}</span>
              {' '}agents
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className={`relative rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-3 ${
                  agent.hasAccess ? '' : 'opacity-60'
                }`}
              >
                {!agent.hasAccess && (
                  <div className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
                    <Icon name="lock" className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 overflow-hidden">
                    {agent.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={agent.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon name="robot" className="w-6 h-6 text-violet-600" />
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-900">{agent.name}</h3>
                  {agent.status === 'DRAFT' && (
                    <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white">
                      Draft
                    </span>
                  )}
                </div>
                {agent.description && (
                  <p className="text-sm text-slate-500 line-clamp-3">{agent.description}</p>
                )}
                {agent.hasAccess ? (
                  <Button
                    onClick={() => startChat(agent.id)}
                    isLoading={startingId === agent.id}
                    loadingLabel="Starting..."
                    className="mt-auto"
                  >
                    Start Chat
                  </Button>
                ) : (
                  <Button disabled className="mt-auto">
                    Locked
                  </Button>
                )}
              </div>
            ))}
          </div>
          {filteredAgents.length === 0 && (
            <p className="py-16 text-center text-slate-400">
              {agents.length === 0 ? 'No AI agents available yet.' : 'No agents match your search.'}
            </p>
          )}
        </PageHeader>
      </div>
    </div>
  );
}
