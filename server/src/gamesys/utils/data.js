function isEmptyDbValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return (
      trimmed === "" ||
      trimmed === "0" ||
      trimmed === "00:00:00" ||
      trimmed === "1900-01-01" ||
      trimmed === "1900-01-01 00:00:00"
    );
  }
  if (typeof value === "number") return value === 0;
  if (typeof value === "bigint") return value === 0n;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function cleanDbValue(value) {
  if (Array.isArray(value)) {
    const cleaned = value.map(cleanDbValue).filter((item) => !isEmptyDbValue(item));
    return cleaned.length ? cleaned : undefined;
  }

  if (value && typeof value === "object") {
    const cleaned = {};
    for (const [key, entry] of Object.entries(value)) {
      const cleanedEntry = cleanDbValue(entry);
      if (!isEmptyDbValue(cleanedEntry)) cleaned[key] = cleanedEntry;
    }
    return Object.keys(cleaned).length ? cleaned : undefined;
  }

  return isEmptyDbValue(value) ? undefined : value;
}

function pickFields(source, fields) {
  if (!source) return null;
  const picked = {};
  for (const field of fields) {
    if (source[field] !== undefined) picked[field] = source[field];
  }
  return picked;
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function countRows(detail, keys) {
  return keys.reduce((total, key) => {
    const value = detail[key];
    if (Array.isArray(value)) return total + value.length;
    return total + (value ? 1 : 0);
  }, 0);
}

module.exports = {
  isEmptyDbValue,
  cleanDbValue,
  pickFields,
  uniqueBy,
  countRows,
};
