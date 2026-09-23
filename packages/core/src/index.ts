/** Workspace wiring marker. Core domain contracts start in CORE-01. */
export const CORE_PACKAGE_ID = "@ieum/core" as const;
export { sliceRawSpan } from "./snapshot.js";
export type { CoreCaptureSnapshot, Utf16Span } from "./snapshot.js";
