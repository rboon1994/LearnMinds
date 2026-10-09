import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
// File uploads and file_search-backed responses are the slowest requests in the app — without a
// timeout, a network hiccup leaves the connection (and the Nest handler awaiting it) hanging
// indefinitely instead of failing fast.
const TIMEOUT_MS = 60_000;
// code_interpreter actually executes code (installing/importing libraries, rendering charts,
// writing multi-page PDFs) rather than just retrieving text — confirmed in production that a
// PDF-generation turn exceeded the 60s above and was aborted client-side (DOMException
// [TimeoutError]) even though the OpenAI-side call would likely have succeeded given more time.
const CODE_INTERPRETER_TIMEOUT_MS = 180_000;

// PDF generation is disabled for now — reportlab's CJK font support turned out to be
// unreliable across generations (registering a CID font doesn't guarantee every style/paragraph
// actually uses it, especially for structured multi-section reports), and the wrong-font failure
// mode is silent (missing glyphs/boxes, not an error) rather than something a retry can reliably
// catch. AgentChatService additionally drops any .pdf a turn produces regardless of this
// instruction — this hint just avoids the wasted generation attempt in the first place. Chart
// (matplotlib) CJK guidance is kept since PNG charts aren't affected by the PDF issue and the
// sandbox's Noto Sans CJK install (confirmed present in production) handles them fine.
const CODE_INTERPRETER_CJK_FONT_HINT =
  'Do not generate PDF files via code_interpreter — PDF generation is currently disabled for ' +
  'this app. If asked for a PDF, or for a report/document, generate an Excel (.xlsx) file ' +
  "instead and tell the user PDF isn't currently supported. When generating a chart via " +
  'code_interpreter that contains any Chinese/Japanese/Korean text, set ' +
  "matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK JP'] (and " +
  "matplotlib.rcParams['axes.unicode_minus'] = False) before rendering any CJK text — the " +
  'default font silently renders it as missing glyphs/boxes instead of raising an error.';

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

type OpenAiResponseObject = {
  status?: string;
  output?: Array<{ type: string; container_id?: string }>;
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

// A container reference (passed back on a later turn) that OpenAI no longer recognizes. OpenAI
// uses two distinct shapes for this, confirmed against real calls:
//   - a stale/nonexistent container id → 404, `{"message":"Container with id '...' not found."}`
//   - a container that existed but genuinely expired (idle timeout) → 400,
//     `{"message":"Container is expired."}` (seen in production — this is the common real-world
//     case, since a reused conversation's container id is almost always the "expired" kind, not
//     the "never existed" kind).
// 400 is matched ONLY when the message itself says the container expired — 400 is also OpenAI's
// generic "malformed request" status, and treating every 400 as "rebuild the container" would
// hide real bugs (bad params, etc.) behind an unrelated, separately-billed container rebuild.
// 410 is kept as a reasonable companion status for an explicitly-deleted container, though not
// separately observed. 429/5xx/timeout are transient and must NOT be treated as "rebuild the
// container", or a rate limit blip would trigger an unnecessary rebuild instead of a normal
// retry/failure.
export function isContainerInvalidError(err: {
  status?: number;
  openAiMessage?: string;
}): boolean {
  if (err.status === 404 || err.status === 410) return true;
  return (
    err.status === 400 && /container.*expired/i.test(err.openAiMessage ?? '')
  );
}

@Injectable()
export class OpenAiService {
  constructor(private config: ConfigService) {}

  private async request(
    path: string,
    init: RequestInit,
    timeoutMs: number = TIMEOUT_MS,
  ): Promise<Response> {
    const apiKey = this.config.getOrThrow<string>('OPENAI_API_KEY');
    const res = await fetch(`${OPENAI_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // .status and .openAiMessage are read by callers that need to distinguish a stale/expired
      // container from a transient failure (429/5xx/timeout) or an unrelated 400 — see
      // isContainerInvalidError below. Every existing caller still just reads .message,
      // unaffected by this addition. openAiMessage is best-effort — a non-JSON body (e.g. an
      // upstream proxy error page) just leaves it undefined rather than throwing here.
      let openAiMessage: string | undefined;
      try {
        openAiMessage = (JSON.parse(body) as { error?: { message?: string } })
          .error?.message;
      } catch {
        // Not JSON — leave openAiMessage undefined.
      }
      throw Object.assign(
        new Error(`OpenAI request failed (${res.status} ${path}): ${body}`),
        { status: res.status, openAiMessage },
      );
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
      // Present only when the conversation has at least one document to hand the sandbox.
      // containerId set = reuse (optimistic; caller retries with it unset on a container-invalid
      // error); unset = let OpenAI create a fresh one via `auto`.
      codeInterpreter?: { containerId?: string; documentFileIds: string[] };
    },
    onDelta: (text: string) => void,
    // Fired on the response.code_interpreter_call.interpreting stream event — lets the caller
    // flip the chat's status bubble to "generating file" mid-stream, reusing this same call
    // instead of a second round-trip.
    onCodeInterpreterStart?: () => void,
  ): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    fileSearchCalls: number;
    codeInterpreterCalls: number;
    containerId?: string;
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
    const systemPrompt = params.codeInterpreter
      ? `${params.systemPrompt}\n\n${CODE_INTERPRETER_CJK_FONT_HINT}`
      : params.systemPrompt;
    const input = [
      {
        role: 'system',
        content: systemPrompt,
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
    const tools: unknown[] = [];
    if (params.vectorStoreIds?.length) {
      tools.push({
        type: 'file_search',
        vector_store_ids: params.vectorStoreIds,
      });
    }
    if (params.codeInterpreter) {
      tools.push({
        type: 'code_interpreter',
        container: params.codeInterpreter.containerId
          ? params.codeInterpreter.containerId
          : {
              type: 'auto',
              file_ids: params.codeInterpreter.documentFileIds,
              // No outbound network from the sandbox — this feature only transforms an already-
              // uploaded file, never needs internet, and this closes the prompt-injection/
              // exfiltration risk of untrusted document content driving the sandbox's own code.
              // Confirmed against a real call: file mounting and pandas/openpyxl both work fine
              // with this disabled.
              network_policy: { type: 'disabled' },
            },
      });
    }
    if (tools.length > 0) body.tools = tools;
    const res = await this.request(
      '/responses',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      params.codeInterpreter ? CODE_INTERPRETER_TIMEOUT_MS : TIMEOUT_MS,
    );
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
        if (event.type === 'response.code_interpreter_call.interpreting') {
          onCodeInterpreterStart?.();
        } else if (event.type === 'response.output_text.delta' && event.delta) {
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
    const codeInterpreterItems =
      output?.filter((item) => item.type === 'code_interpreter_call') ?? [];
    // container_id field path confirmed against a real call: it's a property of the
    // code_interpreter_call output item itself, not nested under response or elsewhere.
    const containerId = codeInterpreterItems[0]?.container_id;
    return {
      text,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      fileSearchCalls,
      codeInterpreterCalls: codeInterpreterItems.length,
      containerId,
    };
  }

  // Produced-file discovery confirmed against a real call: generated files show up in the
  // container's own file list, distinguished from the input file(s) we uploaded by `source`
  // ("assistant" vs "user") — not via a message annotation, though one also exists redundantly.
  async listContainerFiles(
    containerId: string,
  ): Promise<{ id: string; path: string; source: string }[]> {
    const res = await this.request(`/containers/${containerId}/files`, {
      method: 'GET',
    });
    const data = (await res.json()) as {
      data: { id: string; path: string; source: string }[];
    };
    return data.data;
  }

  async downloadContainerFile(
    containerId: string,
    fileId: string,
  ): Promise<Buffer> {
    const res = await this.request(
      `/containers/${containerId}/files/${fileId}/content`,
      { method: 'GET' },
    );
    return Buffer.from(await res.arrayBuffer());
  }

  async deleteContainer(containerId: string): Promise<void> {
    await this.request(`/containers/${containerId}`, { method: 'DELETE' });
  }
}
