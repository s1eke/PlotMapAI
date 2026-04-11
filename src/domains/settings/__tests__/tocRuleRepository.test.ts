import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@infra/db';
import { tocRuleRepository } from '../tocRuleRepository';

describe('tocRuleRepository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('getTocRules returns empty array when no rules', async () => {
    const rules = await tocRuleRepository.getTocRules();
    expect(rules).toEqual([]);
  });

  it('createTocRule creates a new rule', async () => {
    const rule = await tocRuleRepository.createTocRule({
      name: 'New Rule',
      rule: '^Chapter',
      example: 'Chapter 1',
      priority: 5,
      isEnabled: true,
    });
    expect(rule.name).toBe('New Rule');
    expect(rule.rule).toBe('^Chapter');
    expect(rule.isDefault).toBe(false);
  });

  it('updateTocRule updates an existing rule', async () => {
    const created = await tocRuleRepository.createTocRule({
      name: 'Original',
      rule: '^old',
      example: '',
      priority: 10,
      isEnabled: true,
    });
    const updated = await tocRuleRepository.updateTocRule(created.id, { name: 'Updated', isEnabled: false });
    expect(updated.name).toBe('Updated');
    expect(updated.isEnabled).toBe(false);
  });

  it('deleteTocRule deletes non-default rules', async () => {
    const created = await tocRuleRepository.createTocRule({
      name: 'Delete Me',
      rule: '^del',
      example: '',
      priority: 10,
      isEnabled: true,
    });
    const result = await tocRuleRepository.deleteTocRule(created.id);
    expect(result.message).toBe('Rule deleted');
    const rules = await tocRuleRepository.getTocRules();
    expect(rules.find((rule) => rule.id === created.id)).toBeUndefined();
  });

  it('deleteTocRule throws for default rules', async () => {
    await db.tocRules.add({
      name: 'Default',
      rule: '^def',
      example: '',
      serialNumber: 0,
      enable: true,
      isDefault: true,
      createdAt: new Date().toISOString(),
    });
    const rules = await db.tocRules.toArray();
    await expect(tocRuleRepository.deleteTocRule(rules[0].id)).rejects.toThrow('Cannot delete default rules');
  });

  it('uploadTocRulesYaml ignores duplicate rules', async () => {
    await tocRuleRepository.createTocRule({
      name: 'Rule 1',
      rule: '^Chapter',
      example: '',
      priority: 1,
      isEnabled: true,
    });
    const file = new File([`
- name: Rule 1 Duplicate
  rule: ^Chapter
- name: Rule 2
  rule: ^Section
`], 'toc-rules.yaml', { type: 'text/yaml' });

    const rules = await tocRuleRepository.uploadTocRulesYaml(file);
    expect(rules.map((rule) => rule.rule)).toEqual(['^Chapter', '^Section']);
  });

  it('exportTocRulesYaml returns YAML string', async () => {
    await tocRuleRepository.createTocRule({
      name: 'Rule1',
      rule: '^R',
      example: 'R1',
      priority: 1,
      isEnabled: true,
    });
    const yaml = await tocRuleRepository.exportTocRulesYaml();
    expect(yaml).toContain('Rule1');
    expect(yaml).toContain('^R');
  });
});
