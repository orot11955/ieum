import * as z from "zod";

// FE-02's deliberately small persisted subset. Capture raw text is a separate contract.
const SourceSpanSchema = z
  .strictObject({
    start: z.int().nonnegative(),
    end: z.int().positive(),
    encoding: z.literal("utf16"),
  })
  .refine((span) => span.end > span.start, "span end must follow start");

export const EditorSourceRefSchema = z.strictObject({
  sourceKind: z.enum(["unit", "document_revision", "external_excerpt"]),
  sourceId: z.string().min(1),
  sourceRevision: z.int().positive(),
  originKey: z.string().min(1),
  sourceHash: z.string().min(1),
  span: SourceSpanSchema.optional(),
});

const TextNodeSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string().min(1),
  marks: z
    .array(z.strictObject({ type: z.enum(["bold", "italic"]) }))
    .optional(),
});
const SourceReferenceNodeSchema = z.strictObject({
  type: z.literal("sourceReference"),
  attrs: z.strictObject({
    label: z.string().min(1).max(160),
    ref: EditorSourceRefSchema,
  }),
});
const HardBreakNodeSchema = z.strictObject({ type: z.literal("hardBreak") });
const InlineNodeSchema = z.discriminatedUnion("type", [
  TextNodeSchema,
  SourceReferenceNodeSchema,
  HardBreakNodeSchema,
]);
const BlockAttrsSchema = z.strictObject({ blockId: z.uuid() });
const ParagraphSchema = z.strictObject({
  type: z.literal("paragraph"),
  attrs: BlockAttrsSchema,
  content: z.array(InlineNodeSchema).optional(),
});
const HeadingSchema = z.strictObject({
  type: z.literal("heading"),
  attrs: BlockAttrsSchema.extend({ level: z.int().min(1).max(3) }),
  content: z.array(InlineNodeSchema).optional(),
});
const BlockSchema = z.discriminatedUnion("type", [
  ParagraphSchema,
  HeadingSchema,
]);

export const EditorEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  content: z
    .strictObject({
      type: z.literal("doc"),
      content: z.array(BlockSchema).optional(),
    })
    .superRefine((document, context) => {
      const ids = new Set<string>();
      for (const [index, block] of (document.content ?? []).entries()) {
        if (ids.has(block.attrs.blockId)) {
          context.addIssue({
            code: "custom",
            path: ["content", index, "attrs", "blockId"],
            message: "duplicate blockId",
          });
        }
        ids.add(block.attrs.blockId);
      }
    }),
});

export type EditorEnvelope = z.infer<typeof EditorEnvelopeSchema>;
export type EditorBlock = NonNullable<
  EditorEnvelope["content"]["content"]
>[number];
export type EditorSourceRef = z.infer<typeof EditorSourceRefSchema>;

// Any changed block, including a changed source ref, needs claim/source review.
export function compareEditorBlocks(
  before: EditorEnvelope,
  after: EditorEnvelope,
) {
  before = EditorEnvelopeSchema.parse(before);
  after = EditorEnvelopeSchema.parse(after);
  const previous = new Map(
    (before.content.content ?? []).map((block) => [block.attrs.blockId, block]),
  );
  const next = new Map(
    (after.content.content ?? []).map((block) => [block.attrs.blockId, block]),
  );
  const recheckBlockIds = [...next]
    .filter(
      ([id, block]) =>
        !previous.has(id) ||
        JSON.stringify(previous.get(id)) !== JSON.stringify(block),
    )
    .map(([id]) => id);
  const removedBlockIds = [...previous.keys()].filter((id) => !next.has(id));
  return { recheckBlockIds, removedBlockIds } as const;
}
