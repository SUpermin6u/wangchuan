/**
 * json-field.test.ts — JSON field extraction/merge unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jsonField } from '../src/core/json-field.js';

describe('jsonField.extractFields', () => {
  it('extracts specified top-level fields', () => {
    const obj = {
      mcpServers: { playwright: { type: 'stdio' } },
      tipsHistory: { 'new-user': 3 },
      numStartups: 25,
    };
    const result = jsonField.extractFields(obj, ['mcpServers']);
    assert.deepStrictEqual(result, { mcpServers: { playwright: { type: 'stdio' } } });
  });

  it('extracts multiple fields', () => {
    const obj = { security: { auth: 'gongfeng' }, model: { name: 'opus' }, ide: { seen: true } };
    const result = jsonField.extractFields(obj, ['security', 'model']);
    assert.deepStrictEqual(result, { security: { auth: 'gongfeng' }, model: { name: 'opus' } });
  });

  it('ignores non-existent fields', () => {
    const obj = { a: 1 };
    const result = jsonField.extractFields(obj, ['a', 'nonExistent']);
    assert.deepStrictEqual(result, { a: 1 });
  });

  it('returns empty object for empty field list', () => {
    const result = jsonField.extractFields({ a: 1, b: 2 }, []);
    assert.deepStrictEqual(result, {});
  });
});

describe('jsonField.mergeFields', () => {
  it('merges partial into target, preserving other fields', () => {
    const target = { a: 1, b: 2, c: 3 };
    const partial = { b: 99 };
    const result = jsonField.mergeFields(target, partial);
    assert.deepStrictEqual(result, { a: 1, b: 99, c: 3 });
  });

  it('adds new fields from partial to target', () => {
    const target = { a: 1 };
    const partial = { b: 2 };
    const result = jsonField.mergeFields(target, partial);
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });

  it('returns partial when target is empty', () => {
    const result = jsonField.mergeFields({}, { mcpServers: { gongfeng: {} } });
    assert.deepStrictEqual(result, { mcpServers: { gongfeng: {} } });
  });

  it('extract then merge-back preserves other fields', () => {
    const original = {
      mcpServers: { old: 'config' },
      tipsHistory: { tip1: 5 },
      numStartups: 10,
      projects: { '/tmp': { cost: 100 } },
    };
    // Simulate push: extract mcpServers
    const extracted = jsonField.extractFields(original, ['mcpServers']);
    // Simulate remote modification
    (extracted as Record<string, unknown>).mcpServers = { new: 'config' };
    // Simulate pull: merge back into original
    const merged = jsonField.mergeFields(original, extracted);
    // mcpServers updated, other fields preserved
    assert.deepStrictEqual(merged, {
      mcpServers: { new: 'config' },
      tipsHistory: { tip1: 5 },
      numStartups: 10,
      projects: { '/tmp': { cost: 100 } },
    });
  });
});
