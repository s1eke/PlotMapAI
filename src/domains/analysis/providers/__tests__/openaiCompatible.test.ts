import { AppErrorCode } from '@shared/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LLM_TIMEOUT_MS } from '../../services/constants';
import { resolveAnalysisProviderAdapter } from '../registry';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '../types';

const CONFIG = {
  apiBaseUrl: 'http://localhost:5000',
  apiKey: 'token',
  modelName: 'gpt-test',
};

const REQUEST = {
  systemPrompt: 'system',
  userPrompt: 'user',
  temperature: 0,
  maxOutputTokens: 16,
};

describe('openai-compatible provider adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('posts to chat/completions with bearer auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '连接成功' } }],
    })));

    const adapter = resolveAnalysisProviderAdapter(DEFAULT_ANALYSIS_PROVIDER_ID);
    await expect(adapter.generateText(CONFIG, REQUEST)).resolves.toBe('连接成功');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:5000/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    );
  });

  it('joins array-based content items into a single string', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: [
              { text: '{"hello"' },
              { text: ': "world"}' },
            ],
          },
        },
      ],
    })));

    const adapter = resolveAnalysisProviderAdapter(DEFAULT_ANALYSIS_PROVIDER_ID);
    await expect(adapter.generateText(CONFIG, REQUEST)).resolves.toBe('{"hello": "world"}');
  });

  it('surfaces provider error messages from non-200 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'bad api key' } }),
      { status: 401 },
    ));

    const adapter = resolveAnalysisProviderAdapter(DEFAULT_ANALYSIS_PROVIDER_ID);
    await expect(adapter.generateText(CONFIG, REQUEST)).rejects.toMatchObject({
      code: AppErrorCode.AI_RESPONSE_HTTP_ERROR,
      message: 'AI 接口返回错误（HTTP 401）：bad api key',
      userMessageKey: 'errors.AI_RESPONSE_HTTP_ERROR',
    });
  });

  it('maps timeouts to a user-facing timeout error', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }));

    const adapter = resolveAnalysisProviderAdapter(DEFAULT_ANALYSIS_PROVIDER_ID);
    const expectation = expect(adapter.generateText(CONFIG, REQUEST)).rejects.toMatchObject({
      code: AppErrorCode.AI_REQUEST_TIMEOUT,
      message: 'AI 接口请求超时，请稍后重试。',
      retryable: true,
      userMessageKey: 'errors.AI_REQUEST_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS + 1);
    await expectation;
  });
});
