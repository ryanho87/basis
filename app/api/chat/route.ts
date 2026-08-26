import { NextRequest } from "next/server";
import {
  AI_GATEWAY_MODEL,
  getAIGateway,
  getAIGatewayConfigurationError,
} from "@/lib/ai-gateway";
import { buildFinancialContext, ASSISTANT_SYSTEM_PROMPT } from "@/lib/llm-context";
import { getCurrentUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMessage[]; threadId?: string };
  const gatewayError = getAIGatewayConfigurationError();
  if (gatewayError) {
    return new Response(
      JSON.stringify({ error: gatewayError }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const user = await getCurrentUser();
  const context = await buildFinancialContext(user.id);

  // Persist the user's incoming message
  let threadId = body.threadId;
  if (!threadId) {
    const thread = await prisma.chatThread.create({
      data: { userId: user.id, kind: "GENERAL", title: body.messages[0]?.content?.slice(0, 60) ?? "New chat" },
    });
    threadId = thread.id;
  } else {
    const ownedThread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: user.id },
      select: { id: true },
    });
    if (!ownedThread) {
      return Response.json({ error: "Chat thread not found" }, { status: 404 });
    }
  }
  const lastUserMsg = body.messages[body.messages.length - 1];
  if (lastUserMsg?.role === "user") {
    await prisma.chatMessage.create({
      data: { threadId, role: "user", content: lastUserMsg.content },
    });
  }

  const systemPrompt = `${ASSISTANT_SYSTEM_PROMPT}\n\n---\n\n${context}`;

  const stream = await getAIGateway().messages.stream({
    model: AI_GATEWAY_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
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
        await prisma.chatMessage.create({
          data: { threadId: threadId!, role: "assistant", content: assistantText },
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", threadId })}\n\n`));
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
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-thread-id": threadId,
    },
  });
}
