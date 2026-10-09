import { ConfigService } from '@nestjs/config';
import { OpenAiService, isContainerInvalidError } from './openai.service';

function buildService() {
  const config = {
    getOrThrow: () => 'test-api-key',
  } as unknown as ConfigService;
  return new OpenAiService(config);
}

describe('OpenAiService request()', () => {
  it('attaches the HTTP status and parsed OpenAI error message to the thrown error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () =>
        Promise.resolve(
          '{"error":{"message":"Container with id \'cntr_x\' not found."}}',
        ),
    });
    const service = buildService();
    await expect(service.deleteFile('file-123')).rejects.toMatchObject({
      status: 404,
      openAiMessage: "Container with id 'cntr_x' not found.",
    });
  });

  it('leaves openAiMessage undefined when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('<html>Bad Gateway</html>'),
    });
    const service = buildService();
    await expect(service.deleteFile('file-123')).rejects.toMatchObject({
      status: 502,
      openAiMessage: undefined,
    });
  });
});

describe('isContainerInvalidError', () => {
  it('treats 404 and 410 as container-invalid regardless of message', () => {
    expect(isContainerInvalidError({ status: 404 })).toBe(true);
    expect(isContainerInvalidError({ status: 410 })).toBe(true);
  });

  // Confirmed against a real production failure: a genuinely-expired (not merely nonexistent)
  // container returns 400 with this exact message, not 404.
  it('treats 400 "Container is expired." as container-invalid', () => {
    expect(
      isContainerInvalidError({
        status: 400,
        openAiMessage: 'Container is expired.',
      }),
    ).toBe(true);
  });

  it('does NOT treat an unrelated 400 as container-invalid — must not mask other bad requests', () => {
    expect(
      isContainerInvalidError({
        status: 400,
        openAiMessage: 'Invalid value for model.',
      }),
    ).toBe(false);
    expect(isContainerInvalidError({ status: 400 })).toBe(false);
  });

  it('treats everything else (rate limit, server error) as a normal failure', () => {
    expect(isContainerInvalidError({ status: 429 })).toBe(false);
    expect(isContainerInvalidError({ status: 500 })).toBe(false);
    expect(isContainerInvalidError({})).toBe(false);
  });
});

describe('OpenAiService respond() with code_interpreter', () => {
  function sseStream(lines: string[]) {
    const body = lines.map((l) => `data: ${l}\n\n`).join('');
    return {
      ok: true,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: () => {
              if (sent)
                return Promise.resolve({ done: true, value: undefined });
              sent = true;
              return Promise.resolve({
                done: false,
                value: new TextEncoder().encode(body),
              });
            },
          };
        },
      },
    };
  }

  it('includes a code_interpreter tool with network disabled when codeInterpreter param is given', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      sseStream([
        JSON.stringify({ type: 'response.output_text.delta', delta: 'ok' }),
        JSON.stringify({
          type: 'response.completed',
          response: {
            usage: { input_tokens: 1, output_tokens: 1 },
            output: [
              { type: 'code_interpreter_call', container_id: 'cntr_abc' },
            ],
          },
        }),
      ]),
    );
    global.fetch = fetchMock;
    const service = buildService();
    const result = await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'hi' }],
        codeInterpreter: { documentFileIds: ['file-1'] },
      },
      () => {},
    );
    const requestBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(requestBody.tools).toContainEqual({
      type: 'code_interpreter',
      container: {
        type: 'auto',
        file_ids: ['file-1'],
        network_policy: { type: 'disabled' },
      },
    });
    expect(result.codeInterpreterCalls).toBe(1);
    expect(result.containerId).toBe('cntr_abc');
  });

  it('appends the CJK font hint to the system message only when codeInterpreter is present', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      sseStream([
        JSON.stringify({ type: 'response.output_text.delta', delta: 'ok' }),
        JSON.stringify({
          type: 'response.completed',
          response: {
            usage: { input_tokens: 1, output_tokens: 1 },
            output: [],
          },
        }),
      ]),
    );
    global.fetch = fetchMock;
    const service = buildService();

    await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'You are a helpful agent.',
        history: [{ role: 'user', content: 'hi' }],
        codeInterpreter: { documentFileIds: ['file-1'] },
      },
      () => {},
    );
    const withCodeInterpreterBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(withCodeInterpreterBody.input[0].content).toContain(
      'You are a helpful agent.',
    );
    expect(withCodeInterpreterBody.input[0].content).toContain(
      'Do not generate PDF files via code_interpreter',
    );

    await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'You are a helpful agent.',
        history: [{ role: 'user', content: 'hi' }],
      },
      () => {},
    );
    const withoutCodeInterpreterBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(withoutCodeInterpreterBody.input[0].content).toBe(
      'You are a helpful agent.',
    );
  });

  it('tells the model PDF generation is disabled, and to use Excel instead', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      sseStream([
        JSON.stringify({ type: 'response.output_text.delta', delta: 'ok' }),
        JSON.stringify({
          type: 'response.completed',
          response: {
            usage: { input_tokens: 1, output_tokens: 1 },
            output: [],
          },
        }),
      ]),
    );
    global.fetch = fetchMock;
    const service = buildService();
    await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'hi' }],
        codeInterpreter: { documentFileIds: ['file-1'] },
      },
      () => {},
    );
    const requestBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(requestBody.input[0].content).toContain(
      'Do not generate PDF files via code_interpreter',
    );
  });

  it('reuses an existing containerId instead of auto when one is passed', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      sseStream([
        JSON.stringify({ type: 'response.output_text.delta', delta: 'ok' }),
        JSON.stringify({
          type: 'response.completed',
          response: {
            usage: { input_tokens: 1, output_tokens: 1 },
            output: [],
          },
        }),
      ]),
    );
    global.fetch = fetchMock;
    const service = buildService();
    await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'hi' }],
        codeInterpreter: {
          containerId: 'cntr_existing',
          documentFileIds: ['file-1'],
        },
      },
      () => {},
    );
    const requestBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(requestBody.tools).toContainEqual({
      type: 'code_interpreter',
      container: 'cntr_existing',
    });
  });

  it('fires onCodeInterpreterStart when the interpreting stream event arrives', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      sseStream([
        JSON.stringify({ type: 'response.code_interpreter_call.interpreting' }),
        JSON.stringify({ type: 'response.output_text.delta', delta: 'ok' }),
        JSON.stringify({
          type: 'response.completed',
          response: {
            usage: { input_tokens: 1, output_tokens: 1 },
            output: [],
          },
        }),
      ]),
    );
    global.fetch = fetchMock;
    const service = buildService();
    const onStart = jest.fn();
    await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'hi' }],
        codeInterpreter: { documentFileIds: ['file-1'] },
      },
      () => {},
      onStart,
    );
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAiService respond() timeout', () => {
  it('uses a longer timeout for code_interpreter calls than plain chat calls', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: () => {
              if (sent)
                return Promise.resolve({ done: true, value: undefined });
              sent = true;
              const line = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'ok' })}\n\n`;
              return Promise.resolve({
                done: false,
                value: new TextEncoder().encode(line),
              });
            },
          };
        },
      },
    });
    global.fetch = fetchMock;
    const service = buildService();

    await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'hi' }],
      },
      () => {},
    );
    const plainTimeout = timeoutSpy.mock.calls.at(-1)?.[0];

    await service.respond(
      {
        model: 'gpt-5.6',
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'hi' }],
        codeInterpreter: { documentFileIds: ['file-1'] },
      },
      () => {},
    );
    const codeInterpreterTimeout = timeoutSpy.mock.calls.at(-1)?.[0];

    expect(codeInterpreterTimeout).toBeGreaterThan(plainTimeout as number);
    timeoutSpy.mockRestore();
  });
});

describe('OpenAiService container file methods', () => {
  it('listContainerFiles returns the file list, filterable by source', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: 'cfile-1', path: '/mnt/data/input.csv', source: 'user' },
            {
              id: 'cfile-2',
              path: '/mnt/data/report.xlsx',
              source: 'assistant',
            },
          ],
        }),
    });
    const service = buildService();
    const files = await service.listContainerFiles('cntr_abc');
    expect(files).toEqual([
      { id: 'cfile-1', path: '/mnt/data/input.csv', source: 'user' },
      { id: 'cfile-2', path: '/mnt/data/report.xlsx', source: 'assistant' },
    ]);
  });

  it('downloadContainerFile returns the raw bytes as a Buffer', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      // TextEncoder allocates a fresh, exactly-sized ArrayBuffer — Buffer.from(str).buffer would
      // hand back Node's shared, larger-than-needed pool buffer instead (a real gotcha, not a
      // production concern: the real fetch API's arrayBuffer() never does this).
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode('xlsx-bytes').buffer),
    });
    const service = buildService();
    const buf = await service.downloadContainerFile('cntr_abc', 'cfile-2');
    expect(buf.toString()).toBe('xlsx-bytes');
  });

  it('deleteContainer calls the DELETE endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
    const service = buildService();
    await service.deleteContainer('cntr_abc');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/containers/cntr_abc'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
