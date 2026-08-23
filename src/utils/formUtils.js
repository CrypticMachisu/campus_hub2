// Shared form helper.
// 
/**
 * Returns a shallow copy of an object with every string value trimmed.
 * Non-string values pass through unchanged.
 * @param {Object} fields
 * @returns {Object}
 */
export function trimFields(fields) {
  const trimmed = {};
  for (const [key, value] of Object.entries(fields)) {
    trimmed[key] = typeof value === "string" ? value.trim() : value;
  }
  return trimmed;
}
