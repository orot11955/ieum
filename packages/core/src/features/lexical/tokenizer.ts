import { LEXICAL_CONFIG } from "./config.js";

/** Search normalization only; these positions are never source-span positions. */
export function normalizeLexicalText(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

const identifierPattern =
  /(?:\.\/|\/)[\p{L}\p{N}._/-]+|--[a-z][a-z0-9-]*|\b(?:v?\d+(?:\.\d+){1,}(?:-[a-z0-9.]+)?)\b|\b[a-z][a-z0-9]*(?:\+\+|#)(?![a-z0-9])|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu;

export function tokenizeLexicalText(text: string): readonly string[] {
  let remaining = normalizeLexicalText(text);
  const tokens: string[] = [];

  // Remove identifiers before word tokenization: C++ and C# must not collapse to "c".
  remaining = remaining.replace(identifierPattern, (identifier) => {
    tokens.push(`id:${identifier}`);
    return " ";
  });

  for (const match of remaining.matchAll(/[가-힣]+/gu)) {
    const run = match[0];
    for (const size of LEXICAL_CONFIG.koreanNgrams) {
      for (let start = 0; start + size <= run.length; start += 1) {
        tokens.push(`ko${size}:${run.slice(start, start + size)}`);
      }
    }
  }
  for (const match of remaining.matchAll(/[a-z][a-z0-9]*/gu)) {
    tokens.push(`en:${match[0]}`);
  }
  return tokens.sort();
}

export function containsNegation(text: string): boolean {
  const normalized = normalizeLexicalText(text);
  return /\b(?:not|no|never|without)\b|(?:^|\s)(?:안|못)(?=\s)|(?:않|없)[가-힣]*/u.test(
    normalized,
  );
}
