const CREDENCE_RE = /\b\d{3}x\d{2}\b/i;

export function isCredenceFormat(format) {
  return format ? CREDENCE_RE.test(format) : false;
}

