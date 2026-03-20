/**
 * json-field.ts — JSON 字段级提取与合并
 *
 * 支持从大 JSON 文件中 pick 指定顶层字段进行同步，
 * pull 时 merge 回目标 JSON（不破坏其他字段）。
 */

type JsonObject = Record<string, unknown>;

/** 从对象中提取指定顶层字段 */
export function extractFields(obj: JsonObject, fields: readonly string[]): JsonObject {
  const result: JsonObject = {};
  for (const f of fields) {
    if (f in obj) result[f] = obj[f];
  }
  return result;
}

/** 将提取的字段 shallow merge 回目标对象（仅覆盖提取字段，保留其余） */
export function mergeFields(target: JsonObject, partial: JsonObject): JsonObject {
  return { ...target, ...partial };
}

export const jsonField = { extractFields, mergeFields } as const;
