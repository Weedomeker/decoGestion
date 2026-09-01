const REF_EXTRACT_REGEX = {
  LM:    /(?<!\d)\d{8}(?!\d)/,
  CASTO: /(?<!\d)\d{13}(?!\d)/,
  BRICO: /[A-Z]+\d*-\d+/,
  ECOM:  /[A-Z]+\d*-\d+/,
};

const REF_VALIDATE_REGEX = {
  LM:    /^\d{8}$/,
  CASTO: /^\d{13}$/,
  BRICO: /^[A-Z]+\d*-\d{4,}$/,
  ECOM:  /^[A-Z]+\d*-\d{4,}$/,
};

export function isDefinitelyWrongClient(fileName, client) {
  const name = fileName.split(/[\\/]/).pop();
  const hasEAN13    = /(?<!\d)\d{13}(?!\d)/.test(name);
  const has8digit   = /(?<!\d)\d{8}(?!\d)/.test(name);

  if (hasEAN13 && client !== "CASTO") return true;
  if (has8digit && !hasEAN13 && client !== "LM") return true;

  return false;
}

export function extractRefFromFilename(fileName, client) {
  const regex = REF_EXTRACT_REGEX[client] || REF_EXTRACT_REGEX.LM;
  return fileName.match(regex)?.[0] || null;
}

export { REF_EXTRACT_REGEX, REF_VALIDATE_REGEX };
