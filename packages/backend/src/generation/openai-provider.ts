import { ModelGenerationOutputSchema } from "@ieum/contracts/generation";
import type { ModelGenerationOutput } from "@ieum/contracts/generation";
import { GENERATION_INSTRUCTIONS } from "./input.js";

export interface GenerationProvider {
  generate(input: {
    modelId: string;
    serialized: string;
    maxOutputTokens: number;
    signal: AbortSignal;
  }): Promise<{
    output: ModelGenerationOutput;
    inputTokens: number;
    outputTokens: number;
  }>;
}
export class GenerationProviderError extends Error {
  constructor(
    public readonly code: "PROVIDER_UNAVAILABLE" | "INVALID_PROVIDER_OUTPUT",
  ) {
    super(code);
  }
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "targetBlockId", "text", "sourceIndices"],
        properties: {
          kind: { type: "string", enum: ["heading", "paragraph"] },
          targetBlockId: { type: ["string", "null"] },
          text: { type: "string" },
          sourceIndices: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
} as const;

async function boundedBody(response: Response): Promise<string> {
  if (!response.body) throw new GenerationProviderError("PROVIDER_UNAVAILABLE");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 1_000_000)
        throw new GenerationProviderError("INVALID_PROVIDER_OUTPUT");
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(parts));
}

/** Fixed destination, no tools, no provider-side response storage. */
export class OpenAiResponsesProvider implements GenerationProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new GenerationProviderError("PROVIDER_UNAVAILABLE");
  }
  async generate(input: {
    modelId: string;
    serialized: string;
    maxOutputTokens: number;
    signal: AbortSignal;
  }) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: input.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.modelId,
          store: false,
          tools: [],
          tool_choice: "none",
          max_output_tokens: input.maxOutputTokens,
          input: [
            { role: "developer", content: GENERATION_INSTRUCTIONS },
            { role: "user", content: input.serialized },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "ieum_generation",
              strict: true,
              schema,
            },
          },
        }),
      });
    } catch {
      throw new GenerationProviderError("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) throw new GenerationProviderError("PROVIDER_UNAVAILABLE");
    let raw: unknown;
    try {
      raw = JSON.parse(await boundedBody(response));
    } catch {
      throw new GenerationProviderError("INVALID_PROVIDER_OUTPUT");
    }
    if (
      !raw ||
      typeof raw !== "object" ||
      !("status" in raw) ||
      raw.status !== "completed" ||
      !("output" in raw) ||
      !Array.isArray(raw.output) ||
      !("usage" in raw) ||
      !raw.usage ||
      typeof raw.usage !== "object"
    )
      throw new GenerationProviderError("INVALID_PROVIDER_OUTPUT");
    const usage = raw.usage as Record<string, unknown>;
    if (
      !Number.isSafeInteger(usage.input_tokens) ||
      !Number.isSafeInteger(usage.output_tokens) ||
      (usage.input_tokens as number) < 0 ||
      (usage.output_tokens as number) < 0
    )
      throw new GenerationProviderError("INVALID_PROVIDER_OUTPUT");
    const texts = raw.output.flatMap((item: unknown) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("type" in item) ||
        item.type !== "message" ||
        !("content" in item) ||
        !Array.isArray(item.content)
      )
        return [];
      return item.content
        .filter(
          (part: unknown) =>
            part &&
            typeof part === "object" &&
            "type" in part &&
            part.type === "output_text" &&
            "text" in part &&
            typeof part.text === "string",
        )
        .map((part: { text: string }) => part.text);
    });
    if (texts.length !== 1)
      throw new GenerationProviderError("INVALID_PROVIDER_OUTPUT");
    let output: unknown;
    try {
      output = JSON.parse(texts[0]!);
    } catch {
      throw new GenerationProviderError("INVALID_PROVIDER_OUTPUT");
    }
    const parsed = ModelGenerationOutputSchema.safeParse(output);
    if (!parsed.success)
      throw new GenerationProviderError("INVALID_PROVIDER_OUTPUT");
    return {
      output: parsed.data,
      inputTokens: usage.input_tokens as number,
      outputTokens: usage.output_tokens as number,
    };
  }
}
