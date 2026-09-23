import * as z from "zod";

// FE-02 will lock the complete editor node schema; this envelope only versions persisted JSON.
export const EditorEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  content: z.strictObject({
    type: z.literal("doc"),
    content: z.array(z.json()).optional(),
  }),
});

export type EditorEnvelope = z.infer<typeof EditorEnvelopeSchema>;
