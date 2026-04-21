/**
 * json-field.ts — JSON field-level extraction and merge
 *
 * Supports picking specified top-level fields from large JSON files for sync;
 * merges fields back into target JSON on pull (without destroying other fields).
 */

type JsonObject = Record<string, unknown>;

/** Extract specified top-level fields from an object */
function extractFields(obj: JsonObject, fields: readonly string[]): JsonObject {
  const result: JsonObject = {};
  for (const f of fields) {
    if (f in obj) result[f] = obj[f];
  }
  return result;
}

/** Shallow merge extracted fields back into target object (only overwrites extracted fields, preserves the rest) */
function mergeFields(target: JsonObject, partial: JsonObject): JsonObject {
  return { ...target, ...partial };
}

export const jsonField = { extractFields, mergeFields } as const;
