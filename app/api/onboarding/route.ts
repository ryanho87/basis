import { NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { ONBOARDING_SYSTEM_PROMPT, parseOnboardingResult } from "@/lib/onboarding";
import { getCurrentUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { FilingStatus, ProfileType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMessage[] };
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const user = await getCurrentUser();
  const messages = body.messages.length === 0
    ? [{ role: "user" as const, content: "Hi, please introduce yourself and start the interview." }]
    : body.messages;

  const stream = await anthropic.messages.stream({
    model: CLAUDE_MODEL,
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
          const fs = (parsed.result.filingStatus as FilingStatus) || "SINGLE";
          const pt = (parsed.result.profileType as ProfileType) || "UNCLASSIFIED";
          await prisma.user.update({
            where: { id: user.id },
            data: {
              filingStatus: fs,
              state: parsed.result.state,
              profileType: pt,
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
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
