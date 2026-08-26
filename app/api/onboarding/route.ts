import { NextRequest } from "next/server";
import {
  AI_GATEWAY_MODEL,
  getAIGateway,
  getAIGatewayConfigurationError,
} from "@/lib/ai-gateway";
import { ONBOARDING_SYSTEM_PROMPT, parseOnboardingResult } from "@/lib/onboarding";
import { getCurrentUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMessage[] };
  const gatewayError = getAIGatewayConfigurationError();
  if (gatewayError) {
    return new Response(
      JSON.stringify({ error: gatewayError }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const user = await getCurrentUser();
  const messages = body.messages.length === 0
    ? [{ role: "user" as const, content: "Hi, please introduce yourself and start the interview." }]
    : body.messages;

  const stream = await getAIGateway().messages.stream({
    model: AI_GATEWAY_MODEL,
    max_tokens: 2048,
    system: ONBOARDING_SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();
  let assistantText = "";
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            assistantText += event.delta.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "delta", text: event.delta.text })}\n\n`),
            );
          }
        }

        // Try to parse a completion marker. If found, persist profile + suggestions.
        const parsed = parseOnboardingResult(assistantText);
        if (parsed) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              filingStatus: parsed.result.filingStatus,
              state: parsed.result.state,
              profileType: parsed.result.profileType,
              primaryPersona: parsed.result.primaryPersona,
              financialCapabilitiesJson: JSON.stringify(parsed.result.financialCapabilities),
              primaryConcern: parsed.result.primaryConcern,
              onboardingSummary: parsed.result.summary,
              onboardedAt: new Date(),
            },
          });
          // Replace existing strategy suggestions with the new ones
          await prisma.strategySuggestion.deleteMany({ where: { userId: user.id, status: "NEW" } });
          if (parsed.result.suggestedStrategies?.length > 0) {
            await prisma.strategySuggestion.createMany({
              data: parsed.result.suggestedStrategies.map((s) => ({
                userId: user.id,
                title: s.title,
                summary: s.summary,
                category: s.category ?? null,
              })),
            });
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                result: parsed.result,
                userVisibleText: parsed.userVisibleText,
              })}\n\n`,
            ),
          );
        } else {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        }
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "AI Gateway stream failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
