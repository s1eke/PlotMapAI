import { debugLog } from '../debug';
import { LLM_TIMEOUT_MS } from './constants';
import { AnalysisExecutionError } from './errors';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionPayload {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: ChatMessage[];
}

export async function requestChatJson(
  apiBaseUrl: string,
  apiKey: string,
  payload: ChatCompletionPayload,
): Promise<Record<string, unknown>> {
  const content = await requestChatContent(apiBaseUrl, apiKey, payload);
  return extractJsonObject(content);
}

export async function requestChatContent(
  apiBaseUrl: string,
  apiKey: string,
  payload: ChatCompletionPayload,
): Promise<string> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  debugLog('AI', `POST ${url} model=${payload.model} maxTokens=${payload.max_tokens}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AnalysisExecutionError('AI 接口请求超时，请稍后重试。');
    }
    throw new AnalysisExecutionError(`AI 接口连接失败：${err instanceof Error ? err.message : String(err)}`);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AnalysisExecutionError(`AI 接口返回错误（HTTP ${response.status}）：${extractErrorMessage(detail)}`);
  }

  const rawResponse = await response.text();
  debugLog('AI', `response HTTP ${response.status} contentLen=${rawResponse.length}`);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawResponse);
  } catch {
    throw new AnalysisExecutionError('AI 接口返回的不是合法 JSON 响应。');
  }

  if (typeof data !== 'object' || data === null) {
    throw new AnalysisExecutionError('AI 接口返回格式无效。');
  }

  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AnalysisExecutionError('AI 接口返回内容为空。');
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    throw new AnalysisExecutionError('AI 接口返回内容格式无效。');
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (typeof message !== 'object' || message === null) {
    throw new AnalysisExecutionError('AI 接口返回内容格式无效。');
  }

  let content = (message as Record<string, unknown>).content;
  if (Array.isArray(content)) {
    content = content
      .map((item: unknown) => {
        if (typeof item !== 'object' || item === null) return '';
        return typeof (item as Record<string, unknown>).text === 'string'
          ? ((item as Record<string, unknown>).text as string)
          : '';
      })
      .join('');
  }

  if (typeof content !== 'string' || !content.trim()) {
    throw new AnalysisExecutionError('AI 接口未返回有效文本内容。');
  }

  return content;
}

function extractJsonObject(content: string): Record<string, unknown> {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }

  throw new AnalysisExecutionError('AI 返回内容不是合法 JSON。');
}

function extractErrorMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail);
    if (typeof parsed === 'object' && parsed !== null) {
      if (typeof parsed.error === 'object' && parsed.error !== null) {
        return ((parsed.error as Record<string, unknown>).message as string) || detail;
      }
      if (parsed.error) return String(parsed.error);
    }
  } catch {
    // ignore
  }
  return detail.slice(0, 300) || '未知错误';
}
