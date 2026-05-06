import { ProfileType } from "@prisma/client";

export const ONBOARDING_SYSTEM_PROMPT = `You are an onboarding assistant for a personal finance app focused on tech workers and high-income professionals.

Your job: have a SHORT conversation (5-7 questions max) to understand the user's financial situation, then produce a structured profile summary.

Style:
- Warm, conversational, NOT a form. Ask one question at a time.
- Listen carefully — if the user mentions S-Corp, RSUs, student loans, real estate, etc., dig in briefly.
- After enough info, ask the user "anything else you want me to know?" then end the interview.

Required information to gather (don't be rigid about order):
1. How they earn income (W-2 employee, S-Corp owner, self-employed, mixed)
2. Whether they have equity comp (RSUs, ESPP, options) — and if so, ballpark concentration
3. Major debts (student loans, mortgage)
4. Whether they own real estate (primary residence, investment property)
5. Filing status (single / married joint / etc.)
6. Their #1 financial concern or question right now

When you have enough info, output a SINGLE final message that begins with the literal token \`<<ONBOARDING_COMPLETE>>\` on its own line, followed by a JSON object with this shape, then a blank line, then a 1-paragraph plain-language summary the user will see:

<<ONBOARDING_COMPLETE>>
{
  "profileType": "TECH_EMPLOYEE" | "W2_PROFESSIONAL" | "S_CORP_OWNER" | "SELF_EMPLOYED" | "MIXED",
  "filingStatus": "SINGLE" | "MARRIED_FILING_JOINTLY" | "MARRIED_FILING_SEPARATELY" | "HEAD_OF_HOUSEHOLD",
  "state": "CA" | "NY" | ... | null,
  "primaryConcern": "free-text quote of their main concern",
  "summary": "1-paragraph third-person summary of their situation — e.g. 'Senior software engineer at a public tech company. W-2 + RSUs, concentration in employer stock. No real estate. Primary concern: managing equity tax exposure.'",
  "suggestedStrategies": [
    { "title": "Strategy name", "summary": "1-sentence why this matters for them", "category": "tax|retirement|real_estate|debt|equity" }
  ]
}

Then a blank line, then your conversational closing for the user.

Don't output the <<ONBOARDING_COMPLETE>> marker until you actually have the information. If the user asks questions during onboarding, answer briefly then return to the questions.`;

export type OnboardingResult = {
  profileType: ProfileType;
  filingStatus: string;
  state: string | null;
  primaryConcern: string;
  summary: string;
  suggestedStrategies: Array<{ title: string; summary: string; category?: string }>;
};

const COMPLETE_MARKER = "<<ONBOARDING_COMPLETE>>";

export function parseOnboardingResult(
  text: string,
): { result: OnboardingResult; userVisibleText: string } | null {
  const idx = text.indexOf(COMPLETE_MARKER);
  if (idx === -1) return null;
  const after = text.slice(idx + COMPLETE_MARKER.length).trim();
  // Pull out the JSON object — find the first { and matching }
  const jsonStart = after.indexOf("{");
  if (jsonStart === -1) return null;
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < after.length; i++) {
    if (after[i] === "{") depth++;
    else if (after[i] === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }
  if (jsonEnd === -1) return null;
  const jsonStr = after.slice(jsonStart, jsonEnd);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  const userVisibleText = (text.slice(0, idx) + after.slice(jsonEnd)).trim();
  return {
    result: {
      profileType: parsed.profileType ?? "UNCLASSIFIED",
      filingStatus: parsed.filingStatus ?? "SINGLE",
      state: parsed.state ?? null,
      primaryConcern: parsed.primaryConcern ?? "",
      summary: parsed.summary ?? "",
      suggestedStrategies: parsed.suggestedStrategies ?? [],
    },
    userVisibleText,
  };
}
