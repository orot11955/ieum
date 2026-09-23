/** Fixed search-only lexical baseline. Changing any value requires a new version. */
export const LEXICAL_CONFIG = Object.freeze({
  normalizerVersion: "nfkc-lower-v1",
  tokenizerVersion: "ko23-en-identifier-v1",
  idfVersion: "origin-df-smooth-v1",
  koreanNgrams: Object.freeze([2, 3] as const),
  termFrequency: "raw" as const,
  idfSmoothing: 1,
  queryInIdfCorpus: false as const,
  documentUnit: "origin" as const,
});

export type LexicalConfig = typeof LEXICAL_CONFIG;
