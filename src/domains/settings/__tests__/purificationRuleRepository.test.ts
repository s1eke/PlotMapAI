import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@infra/db';
import {
  purificationRuleRepository,
  resetPurificationRuleRepositorySnapshotsForTests,
} from '../purificationRuleRepository';

describe('purificationRuleRepository', () => {
  beforeEach(async () => {
    resetPurificationRuleRepositorySnapshotsForTests();
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('getPurificationRules returns empty array when no rules', async () => {
    const rules = await purificationRuleRepository.getPurificationRules();
    expect(rules).toEqual([]);
  });

  it('reuses the enabled rules snapshot until the underlying rules change', async () => {
    const firstSnapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    const secondSnapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();

    expect(firstSnapshot).toBe(secondSnapshot);
    expect(firstSnapshot.version).toBe(0);
    expect(firstSnapshot.rules).toEqual([]);
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

  it('bumps the enabled rules snapshot version after create, update, toggle, delete, clear, and upload', async () => {
    const initialSnapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();

    const created = await purificationRuleRepository.createPurificationRule({
      name: 'Versioned',
      pattern: 'foo',
      replacement: 'bar',
    });
    let snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    expect(snapshot.version).toBe(initialSnapshot.version + 1);
    expect(snapshot.rules).toHaveLength(1);

    await purificationRuleRepository.updatePurificationRule(created.id, { replacement: 'baz' });
    snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    expect(snapshot.version).toBe(initialSnapshot.version + 2);
    expect(snapshot.rules[0]?.replacement).toBe('baz');

    await purificationRuleRepository.updatePurificationRule(created.id, { isEnabled: false });
    snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    expect(snapshot.version).toBe(initialSnapshot.version + 3);
    expect(snapshot.rules).toEqual([]);

    await purificationRuleRepository.updatePurificationRule(created.id, { isEnabled: true });
    snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    expect(snapshot.version).toBe(initialSnapshot.version + 4);
    expect(snapshot.rules).toHaveLength(1);

    await purificationRuleRepository.deletePurificationRule(created.id);
    snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    expect(snapshot.version).toBe(initialSnapshot.version + 5);
    expect(snapshot.rules).toEqual([]);

    await purificationRuleRepository.createPurificationRule({
      name: 'Clear me',
      pattern: 'clear',
      replacement: '',
    });
    await purificationRuleRepository.clearAllPurificationRules();
    snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    expect(snapshot.version).toBe(initialSnapshot.version + 7);
    expect(snapshot.rules).toEqual([]);

    await purificationRuleRepository.uploadPurificationRulesYaml(new File([`
- name: Uploaded
  pattern: uploaded
  replacement: value
`], 'purification.yaml', { type: 'text/yaml' }));
    snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    expect(snapshot.version).toBe(initialSnapshot.version + 8);
    expect(snapshot.rules).toHaveLength(1);
    expect(snapshot.rules[0]?.pattern).toBe('uploaded');
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
      targetScope: 'all',
      executionStage: 'post-ast',
      ruleVersion: 2,
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

  it('uploadPurificationRulesYaml does not map legacy camelCase keys', async () => {
    const file = new File([`
- name: Legacy Rule
  pattern: legacy
  replacement: updated
  isRegex: false
  isEnabled: false
  scopeTitle: false
  scopeContent: true
  exclusiveGroup: cleanup
`], 'purification.yaml', { type: 'text/yaml' });

    const rules = await purificationRuleRepository.uploadPurificationRulesYaml(file);

    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      pattern: 'legacy',
      replacement: 'updated',
      isRegex: true,
      isEnabled: true,
      targetScope: 'all',
      executionStage: 'post-ast',
      ruleVersion: 2,
    });
    expect(rules[0].exclusiveGroup).toBeUndefined();
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
    expect(yaml).toContain('version: 2');
    expect(yaml).toContain('kind: purification-rules');
    expect(yaml).toContain('exclusive_group: cleanup');
    expect(yaml).toContain('target_scope: all');
  });
});
