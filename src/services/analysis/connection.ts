import { requestChatContent } from './client';
import type { RuntimeAnalysisConfig } from './types';
import { cleanText } from './text';

export async function testAiProviderConnection(
  config: RuntimeAnalysisConfig,
): Promise<{ message: string; preview: string }> {
  const payload = {
    model: config.modelName,
    temperature: 0,
    max_tokens: 16,
    messages: [
      { role: 'system' as const, content: '你是连通性测试助手。请简短回复。' },
      { role: 'user' as const, content: '如果你能看到这条消息，只回复：连接成功' },
    ],
  };
  const content = await requestChatContent(config.apiBaseUrl, config.apiKey, payload);
  return {
    message: 'AI 接口连接测试成功。',
    preview: cleanText(content, 80) || '连接成功',
  };
}
