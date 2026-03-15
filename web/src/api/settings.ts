import client from './client';

export interface TocRule {
  id: number;
  name: string;
  rule: string;
  example: string;
  priority: number;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt?: string;
}

export interface PurificationRule {
  id: number;
  externalId?: number;
  name: string;
  group: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  isEnabled: boolean;
  order: number;
  scopeTitle: boolean;
  scopeContent: boolean;
  bookScope?: string;
  excludeBookScope?: string;
  timeoutMs: number;
  createdAt?: string;
}

export const settingsApi = {
  // TOC Rules
  getTocRules: (): Promise<TocRule[]> => {
    return client.get('/settings/toc-rules');
  },

  createTocRule: (data: Omit<TocRule, 'id' | 'isDefault'>): Promise<TocRule> => {
    return client.post('/settings/toc-rules', data);
  },

  updateTocRule: (id: number, data: Partial<TocRule>): Promise<TocRule> => {
    return client.put(`/settings/toc-rules/${id}`, data);
  },

  deleteTocRule: (id: number): Promise<{ message: string }> => {
    return client.delete(`/settings/toc-rules/${id}`);
  },

  resetTocRules: (): Promise<{ message: string }> => {
    return client.post('/settings/toc-rules/reset');
  },

  // Purification Rules
  getPurificationRules: (): Promise<PurificationRule[]> => {
    return client.get('/settings/purification-rules');
  },

  createPurificationRule: (data: Partial<PurificationRule>): Promise<PurificationRule> => {
    return client.post('/settings/purification-rules', data);
  },

  updatePurificationRule: (id: number, data: Partial<PurificationRule>): Promise<PurificationRule> => {
    return client.put(`/settings/purification-rules/${id}`, data);
  },

  deletePurificationRule: (id: number): Promise<{ message: string }> => {
    return client.delete(`/settings/purification-rules/${id}`);
  },

  uploadPurificationRulesJson: (file: File): Promise<PurificationRule[]> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/settings/purification-rules/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
};
