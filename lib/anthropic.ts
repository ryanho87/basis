import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  // Allow the app to start without the key — chat endpoints will surface a clear error.
  console.warn("[anthropic] ANTHROPIC_API_KEY is not set — LLM endpoints will fail.");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export const CLAUDE_MODEL = "claude-sonnet-4-6";
