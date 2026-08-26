import { createHash } from "node:crypto";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { AI_GATEWAY_MODEL, getAIGateway, getAIGatewayConfigurationError } from "@/lib/ai-gateway";
import { COST_BASIS_EXTRACTION_PROMPT, normalizeCostBasisExtraction } from "@/lib/cost-basis-import";
import { getCurrentUserId } from "@/lib/user";

export const runtime = "nodejs";

const MAX_DOCUMENT_SIZE = 12 * 1024 * 1024;
const MAX_CSV_SIZE = 2 * 1024 * 1024;

function detectedType(bytes: Uint8Array, name: string) {
  if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf" as const;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png" as const;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg" as const;
  if (name.toLowerCase().endsWith(".csv") && !bytes.slice(0, 512).some((byte) => byte === 0)) return "text/csv" as const;
  return null;
}

function parseJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return structured cost-basis data");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export async function POST(request: Request) {
  await getCurrentUserId();
  const gatewayError = getAIGatewayConfigurationError();
  if (gatewayError) return Response.json({ error: gatewayError }, { status: 503 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a brokerage PDF, CSV, PNG, or JPEG" }, { status: 400 });
  if (file.size > MAX_DOCUMENT_SIZE) return Response.json({ error: "Brokerage files must be 12 MB or smaller" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = detectedType(bytes, file.name);
  if (!mediaType) return Response.json({ error: "Only genuine PDF, CSV, PNG, and JPEG files are supported" }, { status: 415 });
  if (mediaType === "text/csv" && file.size > MAX_CSV_SIZE) return Response.json({ error: "CSV exports must be 2 MB or smaller" }, { status: 413 });

  const content: ContentBlockParam[] = mediaType === "text/csv"
    ? [{ type: "text", text: `File name: ${file.name}\n\n${new TextDecoder().decode(bytes)}\n\n${COST_BASIS_EXTRACTION_PROMPT}` }]
    : [
        mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: mediaType, data: Buffer.from(bytes).toString("base64") } }
          : { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(bytes).toString("base64") } },
        { type: "text", text: COST_BASIS_EXTRACTION_PROMPT },
      ];

  try {
    const response = await getAIGateway().messages.create({
      model: AI_GATEWAY_MODEL,
      max_tokens: 5000,
      temperature: 0,
      messages: [{ role: "user", content }],
    });
    const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    const hash = createHash("sha256").update(bytes).digest("hex");
    return Response.json({ extraction: normalizeCostBasisExtraction(parseJson(text), hash) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Cost-basis extraction failed" }, { status: 500 });
  }
}
