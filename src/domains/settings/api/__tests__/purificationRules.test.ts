import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@infra/db';
import { purificationRuleRepository } from '../../purificationRuleRepository';

describe('purificationRuleRepository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('getPurificationRules returns empty array when no rules', async () => {
    const rules = await purificationRuleRepository.getPurificationRules();
    expect(rules).toEqual([]);
  });

  it('createPurificationRule creates a new rule', async () => {
    const rule = await purificationRuleRepository.createPurificationRule({
      name: 'Purify Rule',
      pattern: 'foo',
      replacement: 'bar',
    });
    expect(rule.name).toBe('Purify Rule');
    expect(rule.pattern).toBe('foo');
    expect(rule.replacement).toBe('bar');
    expect(rule.isDefault).toBe(false);
  });

  it('createPurificationRule throws without name or pattern', async () => {
    await expect(purificationRuleRepository.createPurificationRule({})).rejects.toThrow('Missing field');
  });

  it('updatePurificationRule updates fields', async () => {
    const created = await purificationRuleRepository.createPurificationRule({
      name: 'Original',
      pattern: 'old',
      replacement: 'new',
    });
    const updated = await purificationRuleRepository.updatePurificationRule(created.id, { name: 'Updated' });
    expect(updated.name).toBe('Updated');
  });

  it('deletePurificationRule deletes rule', async () => {
    const created = await purificationRuleRepository.createPurificationRule({
      name: 'Delete',
      pattern: 'd',
      replacement: '',
    });
    const result = await purificationRuleRepository.deletePurificationRule(created.id);
    expect(result.message).toBe('Rule deleted');
  });

  it('deletePurificationRule rejects default rules', async () => {
    const id = await db.purificationRules.add({
      externalId: 1,
      name: 'Default Rule',
      group: 'Purification',
      pattern: 'foo',
      replacement: '',
      isRegex: true,
      isEnabled: true,
      order: 0,
      scopeTitle: true,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: '',
      isDefault: true,
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });

    await expect(purificationRuleRepository.deletePurificationRule(id)).rejects.toThrow('Cannot delete default rules');
  });

  it('clearAllPurificationRules clears all', async () => {
    await purificationRuleRepository.createPurificationRule({ name: 'A', pattern: 'a', replacement: '' });
    await purificationRuleRepository.createPurificationRule({ name: 'B', pattern: 'b', replacement: '' });
    await purificationRuleRepository.clearAllPurificationRules();
    const rules = await purificationRuleRepository.getPurificationRules();
    expect(rules).toHaveLength(0);
  });

  it('uploadPurificationRulesYaml ignores duplicate rules', async () => {
    await purificationRuleRepository.createPurificationRule({
      name: 'Rule 1',
      pattern: 'foo',
      replacement: '',
      isRegex: true,
    });
    const file = new File([`
- name: Rule 1 Duplicate
  pattern: foo
  is_regex: true
- name: Rule 2
  pattern: bar
  replacement: baz
  exclusive_group: formatting
`], 'purification.yaml', { type: 'text/yaml' });

    const rules = await purificationRuleRepository.uploadPurificationRulesYaml(file);
    expect(rules.map((rule) => rule.pattern)).toEqual(['foo', 'bar']);
    expect(rules.find((rule) => rule.pattern === 'bar')?.exclusiveGroup).toBe('formatting');
  });

  it('unescapes replacement sequences when importing and saving', async () => {
    const created = await purificationRuleRepository.createPurificationRule({
      name: 'Escaped',
      pattern: 'foo',
      replacement: '\\n',
    });
    expect(created.replacement).toBe('\n');
  });

  it('exportPurificationRulesYaml returns YAML string', async () => {
    await purificationRuleRepository.createPurificationRule({
      name: 'Test',
      pattern: 't',
      replacement: 'r',
      exclusiveGroup: 'cleanup',
    });
    const yaml = await purificationRuleRepository.exportPurificationRulesYaml();
    expect(yaml).toContain('Test');
    expect(yaml).toContain('t');
    expect(yaml).toContain('exclusive_group: cleanup');
  });
});
