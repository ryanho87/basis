import Anthropic from "@anthropic-ai/sdk";

function gatewayCredential() {
  return process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || "";
}

export function getAIGatewayConfigurationError() {
  if (!gatewayCredential()) return "AI Gateway credentials are not configured.";
  if (process.env.NODE_ENV === "production" && process.env.AI_GATEWAY_ZDR_CONFIRMED !== "true") {
    return "AI features are disabled until Zero Data Retention is enabled and AI_GATEWAY_ZDR_CONFIRMED=true is set.";
  }
  return null;
}

export function isAIGatewayConfigured() {
  return getAIGatewayConfigurationError() === null;
}

// Construct per request. Vercel OIDC credentials rotate, so a module-level
// client can silently keep an expired token in a warm serverless instance.
export function getAIGateway() {
  const error = getAIGatewayConfigurationError();
  if (error) throw new Error(error);
  return new Anthropic({
    apiKey: gatewayCredential(),
    baseURL: "https://ai-gateway.vercel.sh",
  });
}

export const AI_GATEWAY_MODEL =
  process.env.AI_GATEWAY_MODEL?.trim() || "anthropic/claude-sonnet-4.6";
