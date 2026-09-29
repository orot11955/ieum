import { useRef } from "react";

function newKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/**
 * One key per distinct submission. A retry or double click of the same content
 * reuses the key so the server answers with the first result; changed content
 * gets a new key because the server rejects a key reused with a different body.
 */
export function useIdempotencyKey() {
  const state = useRef<{ fingerprint: string; key: string } | null>(null);
  return {
    keyFor(fingerprint: string): string {
      if (state.current?.fingerprint !== fingerprint)
        state.current = { fingerprint, key: newKey() };
      return state.current.key;
    },
    reset(): void {
      state.current = null;
    },
  };
}
