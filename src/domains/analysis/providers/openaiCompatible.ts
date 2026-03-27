import { debugLog } from '@app/debug/service';
import { AppErrorCode } from '@shared/errors';
import { LLM_TIMEOUT_MS } from '../services/constants';
import { AnalysisExecutionError } from '../services/errors';
import type {
  AnalysisProviderAdapter,
  AnalysisProviderRequest,
  OpenAiCompatibleProviderConfig,
} from './types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionPayload {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: ChatMessage[];
}

function createAbortErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractMessageContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item !== 'object' || item === null) {
          return '';
        }

        return typeof (item as Record<string, unknown>).text === 'string'
          ? ((item as Record<string, unknown>).text as string)
          : '';
      })
      .join('');
  }

  return typeof content === 'string' ? content : '';
}

function extractErrorMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail);
    if (typeof parsed === 'object' && parsed !== null) {
      if (typeof parsed.error === 'object' && parsed.error !== null) {
        return ((parsed.error as Record<string, unknown>).message as string) || detail;
      }
      if (parsed.error) {
        return String(parsed.error);
      }
    }
  } catch {
    // ignore parse failures
  }

  return detail.slice(0, 300) || '未知错误';
}

function createTimeoutController(signal?: AbortSignal): {
  cleanup: () => void;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  const abortFromParent = () => controller.abort();
  signal?.addEventListener('abort', abortFromParent, { once: true });

  return {
    cleanup: () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromParent);
    },
    signal: controller.signal,
  };
}

async function requestChatCompletion(
  config: OpenAiCompatibleProviderConfig,
  payload: ChatCompletionPayload,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${config.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  const { cleanup, signal: requestSignal } = createTimeoutController(signal);
  debugLog('AI', `POST ${url} model=${payload.model} maxTokens=${payload.max_tokens}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: requestSignal,
    });
  } catch (error) {
    cleanup();
    if (requestSignal.aborted) {
      throw new AnalysisExecutionError('AI 接口请求超时，请稍后重试。', {
        code: AppErrorCode.AI_REQUEST_TIMEOUT,
        retryable: true,
        userMessageKey: 'errors.AI_REQUEST_TIMEOUT',
      });
    }
    throw new AnalysisExecutionError(`AI 接口连接失败：${createAbortErrorMessage(error)}`, {
      code: AppErrorCode.AI_CONNECTION_FAILED,
      retryable: true,
      userMessageKey: 'errors.AI_CONNECTION_FAILED',
      cause: error,
    });
  }

  cleanup();

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AnalysisExecutionError(`AI 接口返回错误（HTTP ${response.status}）：${extractErrorMessage(detail)}`, {
      code: AppErrorCode.AI_RESPONSE_HTTP_ERROR,
      retryable: response.status >= 500 || response.status === 429,
      userMessageKey: 'errors.AI_RESPONSE_HTTP_ERROR',
      userMessageParams: { status: response.status },
      details: { status: response.status },
    });
  }

  const rawResponse = await response.text();
  debugLog('AI', `response HTTP ${response.status} contentLen=${rawResponse.length}`);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawResponse);
  } catch {
    throw new AnalysisExecutionError('AI 接口返回的不是合法 JSON 响应。', {
      code: AppErrorCode.AI_RESPONSE_INVALID,
      userMessageKey: 'errors.AI_RESPONSE_INVALID',
    });
  }

  if (typeof data !== 'object' || data === null) {
    throw new AnalysisExecutionError('AI 接口返回格式无效。', {
      code: AppErrorCode.AI_RESPONSE_INVALID,
      userMessageKey: 'errors.AI_RESPONSE_INVALID',
    });
  }

  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AnalysisExecutionError('AI 接口返回内容为空。', {
      code: AppErrorCode.AI_RESPONSE_EMPTY,
      userMessageKey: 'errors.AI_RESPONSE_EMPTY',
    });
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    throw new AnalysisExecutionError('AI 接口返回内容格式无效。', {
      code: AppErrorCode.AI_RESPONSE_INVALID,
      userMessageKey: 'errors.AI_RESPONSE_INVALID',
    });
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (typeof message !== 'object' || message === null) {
    throw new AnalysisExecutionError('AI 接口返回内容格式无效。', {
      code: AppErrorCode.AI_RESPONSE_INVALID,
      userMessageKey: 'errors.AI_RESPONSE_INVALID',
    });
  }

  const content = extractMessageContent((message as Record<string, unknown>).content);
  if (!content.trim()) {
    throw new AnalysisExecutionError('AI 接口未返回有效文本内容。', {
      code: AppErrorCode.AI_RESPONSE_NO_TEXT,
      userMessageKey: 'errors.AI_RESPONSE_NO_TEXT',
    });
  }

  return content;
}

function createChatPayload(
  config: OpenAiCompatibleProviderConfig,
  request: AnalysisProviderRequest,
): ChatCompletionPayload {
  return {
    model: config.modelName,
    temperature: request.temperature,
    max_tokens: request.maxOutputTokens,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ],
  };
}

export const openAiCompatibleAnalysisProvider: AnalysisProviderAdapter = {
  async generateText(
    config,
    request,
    signal,
  ): Promise<string> {
    return requestChatCompletion(config, createChatPayload(config, request), signal);
  },

  async testConnection(
    config,
    signal,
  ): Promise<string> {
    return requestChatCompletion(config, {
      model: config.modelName,
      temperature: 0,
      max_tokens: 16,
      messages: [
        { role: 'system', content: '你是连通性测试助手。请简短回复。' },
        { role: 'user', content: '如果你能看到这条消息，只回复：连接成功' },
      ],
    }, signal);
  },
};
