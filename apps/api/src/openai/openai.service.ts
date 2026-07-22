import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
// File uploads and file_search-backed responses are the slowest requests in the app — without a
// timeout, a network hiccup leaves the connection (and the Nest handler awaiting it) hanging
// indefinitely instead of failing fast.
const TIMEOUT_MS = 60_000;

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

type OpenAiResponsesPayload = {
  status?: string;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
};

@Injectable()
export class OpenAiService {
  constructor(private config: ConfigService) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = this.config.getOrThrow<string>('OPENAI_API_KEY');
    const res = await fetch(`${OPENAI_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI request failed (${res.status} ${path}): ${body}`);
    }
    return res;
  }

  async createVectorStore(name: string): Promise<string> {
    const res = await this.request('/vector_stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async deleteVectorStore(vectorStoreId: string): Promise<void> {
    await this.request(`/vector_stores/${vectorStoreId}`, { method: 'DELETE' });
  }

  async uploadFile(path: string, fileName: string): Promise<string> {
    const buffer = await readFile(path);
    const form = new FormData();
    form.append('purpose', 'assistants');
    form.append('file', new Blob([buffer]), fileName);
    const res = await this.request('/files', { method: 'POST', body: form });
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request(`/files/${fileId}`, { method: 'DELETE' });
  }

  async attachFileToVectorStore(
    vectorStoreId: string,
    fileId: string,
  ): Promise<void> {
    await this.request(`/vector_stores/${vectorStoreId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
  }

  async respond(params: {
    model: string;
    systemPrompt: string;
    history: ChatHistoryItem[];
    vectorStoreId?: string | null;
    temperature?: number | null;
  }): Promise<string> {
    const input = [
      { role: 'system', content: params.systemPrompt },
      ...params.history.map((m) => ({ role: m.role, content: m.content })),
    ];
    const body: Record<string, unknown> = { model: params.model, input };
    if (params.temperature != null) body.temperature = params.temperature;
    // tool_resources is a sibling of tools, not nested inside a tools[] element — sending
    // vector_store_ids inside the tools array item is rejected by OpenAI with a 400.
    if (params.vectorStoreId) {
      body.tools = [{ type: 'file_search' }];
      body.tool_resources = {
        file_search: { vector_store_ids: [params.vectorStoreId] },
      };
    }
    const res = await this.request('/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as OpenAiResponsesPayload;
    const message = data.output?.find((item) => item.type === 'message');
    const text = message?.content
      ?.filter((part) => part.type === 'output_text' && part.text)
      .map((part) => part.text)
      .join('');
    // A missing/empty message (e.g. status: 'incomplete', or a tool-call-only turn) must not be
    // mistaken for a real "the agent said nothing" reply — surface it as a failure instead.
    if (!text) {
      throw new Error(
        `OpenAI response had no output text (status: ${data.status ?? 'unknown'})`,
      );
    }
    return text;
  }
}
