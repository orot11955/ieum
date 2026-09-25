import { useRef } from "react";
import { Node, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "@tiptap/extension-unique-id";
import {
  EditorEnvelopeSchema,
  type EditorEnvelope,
  type EditorSourceRef,
} from "@ieum/contracts/editor";
import { Button, Cluster, Notice, Stack } from "@ieum/ui";

const SourceReference = Node.create({
  name: "sourceReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      label: {
        default: "출처 확인 필요",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-ieum-source-label") || "출처 확인 필요",
      },
      ref: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          try {
            return JSON.parse(
              element.getAttribute("data-ieum-source-ref") ?? "null",
            ) as unknown;
          } catch {
            return null;
          }
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-ieum-source-ref]" }];
  },
  renderHTML({ node }) {
    const label =
      typeof node.attrs.label === "string" && node.attrs.label
        ? node.attrs.label
        : "출처 확인 필요";
    return [
      "span",
      {
        class: "ieum-status",
        "data-tone": "info",
        "data-ieum-source-label": label,
        "data-ieum-source-ref": JSON.stringify(node.attrs.ref ?? null),
      },
      label,
    ];
  },
});

export const editorExtensions = [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    listItem: false,
    listKeymap: false,
    link: false,
    orderedList: false,
    strike: false,
    trailingNode: false,
    underline: false,
  }),
  UniqueID.configure({
    types: ["paragraph", "heading"],
    attributeName: "blockId",
  }),
  SourceReference,
];

function toTiptapContent(envelope: EditorEnvelope): JSONContent {
  return {
    type: "doc",
    content: (envelope.content.content ?? []).map((block) => ({
      type: block.type,
      attrs: block.attrs,
      content: (block.content ?? []).map((node) => {
        if (node.type === "text")
          return {
            type: "text",
            text: node.text,
            ...(node.marks ? { marks: node.marks } : {}),
          };
        if (node.type === "sourceReference")
          return { type: node.type, attrs: node.attrs };
        return { type: node.type };
      }),
    })),
  };
}

export function EditorAdapter({
  initial,
  onValidChange,
  onInvalid,
  insertableReference,
}: {
  initial: EditorEnvelope;
  onValidChange: (value: EditorEnvelope) => void;
  onInvalid: (reason: string) => void;
  insertableReference?: { label: string; ref: EditorSourceRef };
}) {
  const composing = useRef(false);
  const handlers = useRef({ onValidChange, onInvalid });
  handlers.current = { onValidChange, onInvalid };
  const editor = useEditor({
    extensions: editorExtensions,
    content: toTiptapContent(initial),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "ieum-field ieum-editor ieum-prose ieum-rich-editor",
        role: "textbox",
        "aria-label": "문서 본문",
        "aria-multiline": "true",
      },
      handleDOMEvents: {
        compositionstart: () => {
          composing.current = true;
          return false;
        },
        compositionend: () => {
          composing.current = false;
          queueMicrotask(() => {
            if (!editor || composing.current) return;
            const result = EditorEnvelopeSchema.safeParse({
              schemaVersion: 1,
              content: editor.getJSON(),
            });
            if (result.success) handlers.current.onValidChange(result.data);
            else handlers.current.onInvalid("편집 schema를 확인해 주세요.");
          });
          return false;
        },
      },
    },
    onUpdate: ({ editor: updated }) => {
      if (composing.current) return;
      const result = EditorEnvelopeSchema.safeParse({
        schemaVersion: 1,
        content: updated.getJSON(),
      });
      if (result.success) handlers.current.onValidChange(result.data);
      else handlers.current.onInvalid("편집 schema를 확인해 주세요.");
    },
  });
  return (
    <Stack>
      <Cluster>
        <Button
          disabled={!editor}
          onClick={() => editor?.chain().focus().setParagraph().run()}
        >
          본문
        </Button>
        <Button
          disabled={!editor}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          제목 2
        </Button>
        <Button
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          굵게
        </Button>
        <Button
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          기울임
        </Button>
        <Button
          disabled={!editor || !insertableReference}
          onClick={() => {
            if (insertableReference)
              editor
                ?.chain()
                .focus()
                .insertContent({
                  type: "sourceReference",
                  attrs: insertableReference,
                })
                .run();
          }}
        >
          출처 표본 삽입
        </Button>
      </Cluster>
      <EditorContent editor={editor} />
      <Notice tone="info">
        원문 입력기는 별도입니다. 이 표본은 구조화 문서만 편집합니다.
      </Notice>
    </Stack>
  );
}
