/**
 * json-field.test.ts — JSON 字段提取/合并 单元测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jsonField } from '../src/core/json-field.js';

describe('jsonField.extractFields', () => {
  it('提取指定的顶层字段', () => {
    const obj = {
      mcpServers: { playwright: { type: 'stdio' } },
      tipsHistory: { 'new-user': 3 },
      numStartups: 25,
    };
    const result = jsonField.extractFields(obj, ['mcpServers']);
    assert.deepStrictEqual(result, { mcpServers: { playwright: { type: 'stdio' } } });
  });

  it('提取多个字段', () => {
    const obj = { security: { auth: 'gongfeng' }, model: { name: 'opus' }, ide: { seen: true } };
    const result = jsonField.extractFields(obj, ['security', 'model']);
    assert.deepStrictEqual(result, { security: { auth: 'gongfeng' }, model: { name: 'opus' } });
  });

  it('字段不存在时忽略', () => {
    const obj = { a: 1 };
    const result = jsonField.extractFields(obj, ['a', 'nonExistent']);
    assert.deepStrictEqual(result, { a: 1 });
  });

  it('空字段列表返回空对象', () => {
    const result = jsonField.extractFields({ a: 1, b: 2 }, []);
    assert.deepStrictEqual(result, {});
  });
});

describe('jsonField.mergeFields', () => {
  it('将 partial 合并到 target，保留其他字段', () => {
    const target = { a: 1, b: 2, c: 3 };
    const partial = { b: 99 };
    const result = jsonField.mergeFields(target, partial);
    assert.deepStrictEqual(result, { a: 1, b: 99, c: 3 });
  });

  it('partial 中有新字段时添加到 target', () => {
    const target = { a: 1 };
    const partial = { b: 2 };
    const result = jsonField.mergeFields(target, partial);
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });

  it('target 为空时返回 partial', () => {
    const result = jsonField.mergeFields({}, { mcpServers: { gongfeng: {} } });
    assert.deepStrictEqual(result, { mcpServers: { gongfeng: {} } });
  });

  it('extract 后 merge 回原对象不丢失其他字段', () => {
    const original = {
      mcpServers: { old: 'config' },
      tipsHistory: { tip1: 5 },
      numStartups: 10,
      projects: { '/tmp': { cost: 100 } },
    };
    // 模拟 push: 提取 mcpServers
    const extracted = jsonField.extractFields(original, ['mcpServers']);
    // 模拟远端修改
    (extracted as Record<string, unknown>).mcpServers = { new: 'config' };
    // 模拟 pull: merge 回原对象
    const merged = jsonField.mergeFields(original, extracted);
    // mcpServers 被更新，其他字段保留
    assert.deepStrictEqual(merged, {
      mcpServers: { new: 'config' },
      tipsHistory: { tip1: 5 },
      numStartups: 10,
      projects: { '/tmp': { cost: 100 } },
    });
  });
});
