const CREDENCE_RE = /\b\d{3}x\d{2}\b/i;

export function isCredenceFormat(format) {
  return format ? CREDENCE_RE.test(format) : false;
}

export function isCredenceClient(client) {
  return client === "BRICO" || client === "CASTO";
}

export function isCredence(format, client) {
  return isCredenceFormat(format) && isCredenceClient(client);
}
