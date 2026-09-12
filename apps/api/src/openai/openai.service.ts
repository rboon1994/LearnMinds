import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
// File uploads and file_search-backed responses are the slowest requests in the app — without a
// timeout, a network hiccup leaves the connection (and the Nest handler awaiting it) hanging
// indefinitely instead of failing fast.
const TIMEOUT_MS = 60_000;

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

type OpenAiResponseObject = {
  status?: string;
  output?: Array<{ type: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { message?: string; code?: string };
  incomplete_details?: { reason?: string };
};

// Flat shape covering the SSE event types this app actually reacts to — every other event type
// in the stream (response.created, response.output_item.added, etc.) is read past and ignored,
// so delta/response are optional rather than a discriminated union.
type OpenAiStreamEvent = {
  type: string;
  delta?: string;
  response?: OpenAiResponseObject;
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
    return this.uploadBuffer(buffer, fileName);
  }

  // For content generated in-process (e.g. an Excel sheet converted to text) rather than read
  // from a file already on disk — same endpoint, just skips the readFile step.
  async uploadTextContent(content: string, fileName: string): Promise<string> {
    return this.uploadBuffer(Buffer.from(content, 'utf8'), fileName);
  }

  private async uploadBuffer(
    buffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const form = new FormData();
    form.append('purpose', 'assistants');
    // Buffer's ArrayBufferLike (which includes SharedArrayBuffer) isn't assignable to BlobPart's
    // ArrayBuffer-only expectation — Uint8Array.from copies into a plain, real ArrayBuffer.
    form.append('file', new Blob([Uint8Array.from(buffer)]), fileName);
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

  // Attaching a file to a vector store only queues it — OpenAI indexes/embeds it
  // asynchronously afterward, so file_search can silently find nothing if a reply is generated
  // before this finishes (confirmed empirically: status is still "in_progress" immediately after
  // attach, and only flips to "completed" a few seconds later). Polls until it's actually
  // searchable, or definitively isn't.
  async waitForVectorStoreFileReady(
    vectorStoreId: string,
    fileId: string,
  ): Promise<void> {
    const pollIntervalMs = 1000;
    const maxAttempts = 30; // ~30s ceiling — generous for one document, but bounded so a stuck
    // OpenAI-side indexing job can't hang the request indefinitely.
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await this.request(
        `/vector_stores/${vectorStoreId}/files/${fileId}`,
        { method: 'GET' },
      );
      const { status } = (await res.json()) as { status: string };
      if (status === 'completed') return;
      if (status === 'failed' || status === 'cancelled') {
        throw new Error(
          `OpenAI failed to index file ${fileId} in vector store ${vectorStoreId} (status: ${status})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(
      `Timed out waiting for file ${fileId} to finish indexing in vector store ${vectorStoreId}`,
    );
  }

  // Streams the reply so the caller can forward text as it's generated (bubble-by-bubble in the
  // chat UI) instead of waiting for the full completion — onDelta fires once per
  // response.output_text.delta event, in order, with just that chunk's text.
  async respond(
    params: {
      model: string;
      systemPrompt: string;
      history: ChatHistoryItem[];
      // Images are only ever analyzed on the turn they're uploaded (never re-sent on later
      // turns), so they're attached here to the last history item — the message currently being
      // answered — rather than threaded through ChatHistoryItem itself.
      currentImages?: { base64: string; mimeType: string }[];
      // Merged from the agent's shared KnowledgeBase and this conversation's own attached-files
      // store — both are searched together in one file_search call.
      vectorStoreIds?: string[];
      temperature?: number | null;
    },
    onDelta: (text: string) => void,
  ): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    fileSearchCalls: number;
  }> {
    const lastIndex = params.history.length - 1;
    const historyInput = params.history.map((m, i) => {
      if (i !== lastIndex || !params.currentImages?.length) {
        return { role: m.role, content: m.content };
      }
      return {
        role: m.role,
        content: [
          { type: 'input_text', text: m.content },
          ...params.currentImages.map((img) => ({
            type: 'input_image',
            image_url: `data:${img.mimeType};base64,${img.base64}`,
          })),
        ],
      };
    });
    const input = [
      {
        role: 'system',
        content: params.systemPrompt,
      },
      ...historyInput,
    ];
    const body: Record<string, unknown> = {
      model: params.model,
      input,
      stream: true,
    };
    if (params.temperature != null) body.temperature = params.temperature;
    // vector_store_ids is a direct property of the file_search tool object itself — a
    // top-level tool_resources sibling (the previous shape here) is rejected by OpenAI with
    // "Unknown parameter: 'tool_resources'".
    if (params.vectorStoreIds?.length) {
      body.tools = [
        { type: 'file_search', vector_store_ids: params.vectorStoreIds },
      ];
    }
    const res = await this.request('/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.body) {
      throw new Error('OpenAI streaming response had no body');
    }

    let text = '';
    let usage: OpenAiResponseObject['usage'];
    let output: OpenAiResponseObject['output'];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    // SSE frames are separated by a blank line; each frame here is one `event:`+`data:` line
    // pair. Buffered across reads since a frame boundary can land mid-chunk.
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let frameEnd: number;
      while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        const dataLine = frame
          .split('\n')
          .find((line) => line.startsWith('data: '));
        if (!dataLine) continue;
        const event = JSON.parse(
          dataLine.slice('data: '.length),
        ) as OpenAiStreamEvent;
        if (event.type === 'response.output_text.delta' && event.delta) {
          text += event.delta;
          onDelta(event.delta);
        } else if (event.type === 'response.completed' && event.response) {
          usage = event.response.usage;
          output = event.response.output;
        } else if (
          (event.type === 'response.failed' ||
            event.type === 'response.incomplete') &&
          event.response
        ) {
          // Thrown immediately rather than left to fall through to the `!text` check below —
          // deltas may have already streamed before this event, in which case `text` is
          // non-empty and that check would silently accept the truncated reply as a success
          // (with `usage` left undefined, undercounting the real billed tokens as $0).
          const reason =
            event.response.error?.message ??
            event.response.incomplete_details?.reason ??
            event.response.status ??
            event.type;
          throw new Error(`OpenAI response ${event.type}: ${reason}`);
        }
      }
    }
    // A missing/empty message (e.g. status: 'incomplete', or a tool-call-only turn) must not be
    // mistaken for a real "the agent said nothing" reply — surface it as a failure instead.
    if (!text) {
      throw new Error(
        `OpenAI response had no output text (status: ${output ? 'no text in completed output' : 'stream ended without a completed event'})`,
      );
    }
    // Each output item of this type is one billable file_search invocation ($2.50/1000 calls) —
    // the model decides per-turn whether to search at all, and can search more than once.
    const fileSearchCalls =
      output?.filter((item) => item.type === 'file_search_call').length ?? 0;
    return {
      text,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      fileSearchCalls,
    };
  }
}
