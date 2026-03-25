import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnalysisExecutionError } from '../analysis/errors';
import { requestChatContent, requestChatJson } from '../analysis/client';

const PAYLOAD = {
  model: 'gpt-test',
  temperature: 0,
  max_tokens: 16,
  messages: [
    { role: 'system' as const, content: 'system' },
    { role: 'user' as const, content: 'user' },
  ],
};

describe('analysis client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('joins array-based message content into a single string', async () => {
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

    await expect(requestChatContent('http://localhost:5000', 'token', PAYLOAD))
      .resolves.toBe('{"hello": "world"}');
  });

  it('extracts json from fenced model output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: '```json\n{"ok":true}\n```',
          },
        },
      ],
    })));

    await expect(requestChatJson('http://localhost:5000', 'token', PAYLOAD))
      .resolves.toEqual({ ok: true });
  });

  it('surfaces provider error messages from non-200 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'bad api key' } }),
      { status: 401 },
    ));

    await expect(requestChatContent('http://localhost:5000', 'token', PAYLOAD))
      .rejects.toThrow(new AnalysisExecutionError('AI 接口返回错误（HTTP 401）：bad api key'));
  });
});
