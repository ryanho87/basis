import { createHash } from "node:crypto";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { AI_GATEWAY_MODEL, getAIGateway, getAIGatewayConfigurationError } from "@/lib/ai-gateway";
import { getCurrentUserId } from "@/lib/user";
import { normalizePayStubExtraction, PAY_STUB_EXTRACTION_PROMPT } from "@/lib/pay-stub";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;

function mediaType(bytes: Uint8Array) {
  if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf" as const;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png" as const;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg" as const;
  return null;
}

function parseJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return structured pay-stub data");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export async function POST(request: Request) {
  await getCurrentUserId();
  const gatewayError = getAIGatewayConfigurationError();
  if (gatewayError) {
    return Response.json({ error: gatewayError }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a pay stub PDF, PNG, or JPEG" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Pay stub must be 8 MB or smaller" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = mediaType(bytes);
  if (!detectedType) {
    return Response.json({ error: "Only genuine PDF, PNG, and JPEG files are supported" }, { status: 415 });
  }

  const data = Buffer.from(bytes).toString("base64");
  const document: ContentBlockParam = detectedType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: detectedType, data } }
    : { type: "image", source: { type: "base64", media_type: detectedType, data } };

  try {
    const response = await getAIGateway().messages.create({
      model: AI_GATEWAY_MODEL,
      max_tokens: 1600,
      temperature: 0,
      messages: [{ role: "user", content: [document, { type: "text", text: PAY_STUB_EXTRACTION_PROMPT }] }],
    });
    const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    const hash = createHash("sha256").update(bytes).digest("hex");
    return Response.json({ extraction: normalizePayStubExtraction(parseJson(text), hash) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pay-stub extraction failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
