import { FilingStatus, ProfileType } from "@prisma/client";
import {
  CAPABILITY_LABELS,
  deriveCapabilities,
  FINANCIAL_CAPABILITIES,
  parseFinancialCapabilities,
  parsePrimaryPersona,
  type FinancialCapability,
  type PrimaryPersona,
} from "@/lib/profile-capabilities";

export const ONBOARDING_SYSTEM_PROMPT = `You are an onboarding assistant for a personal finance app focused on tech professionals, physicians, and other high-income professionals. The user has explicitly opted into being roasted about themself, their financial decisions, and their portfolio.

Your job: have a SHORT conversation (5-7 questions max) to understand the user's financial situation, then produce a structured profile summary.

Style:
- Savage but warm, conversational, and NOT a form. Ask one question at a time.
- Roast the user directly when their answers give you specific material. Make the joke, then ask the useful follow-up.
- Keep jokes grounded in facts the user supplied. Never invent peer averages, percentiles, or rankings. If comparison data is missing, say so rather than manufacturing a leaderboard.
- Do not target protected traits, health, trauma, family status, or circumstances outside the user's control. Financial decisions are fair game; human worth is not a financial metric.
- Identify both their profession/persona and their financial capabilities. Do not assume every physician owns a practice or every tech worker has equity.
- If the user is a physician, briefly determine whether their clinical income is W-2, 1099, paid to an entity, or mixed; whether an S-corp pays owner payroll; whether they make estimated payments; and whether they have a business retirement plan. Do not interrogate them about patients, health, or protected traits.
- Listen carefully. If the user mentions S-corp, RSUs, student loans, real estate, multiple employers, or a payroll provider, dig in briefly.
- After enough info, ask the user "anything else you want me to know?" then end the interview.

Required information to gather (don't be rigid about order):
1. Their profession or primary work context (tech, physician, business owner, or another high-income profession)
2. How they earn income (W-2 employee, S-corp owner payroll, 1099/self-employed, or mixed)
3. Whether they have equity comp (RSUs, ESPP, options), or for owners, quarterly taxes and a business retirement plan
4. Major debts (student loans, mortgage)
5. Whether they own real estate (primary residence, investment property)
6. Filing status, state, and their #1 financial concern or question right now

When you have enough info, output a SINGLE final message that begins with the literal token \`<<ONBOARDING_COMPLETE>>\` on its own line, followed by a JSON object with this shape, then a blank line, then a 1-paragraph plain-language summary the user will see:

<<ONBOARDING_COMPLETE>>
{
  "primaryPersona": "TECH_PROFESSIONAL" | "PHYSICIAN" | "OWNER_OPERATOR" | "HIGH_EARNING_PROFESSIONAL",
  "profileType": "TECH_EMPLOYEE" | "W2_PROFESSIONAL" | "S_CORP_OWNER" | "SELF_EMPLOYED" | "MIXED",
  "financialCapabilities": ["W2_INCOME", "S_CORP"],
  "filingStatus": "SINGLE" | "MARRIED_FILING_JOINTLY" | "MARRIED_FILING_SEPARATELY" | "HEAD_OF_HOUSEHOLD",
  "state": "CA" | "NY" | ... | null,
  "primaryConcern": "free-text quote of their main concern",
  "summary": "1-paragraph third-person summary of their situation with one specific roast grounded in their answers",
  "suggestedStrategies": [
    { "title": "Strategy name", "summary": "1-sentence why this matters for them, optionally with a concise roast", "category": "tax|retirement|real_estate|debt|equity" }
  ]
}

The financialCapabilities array may contain only these values: ${FINANCIAL_CAPABILITIES.join(", ")}. Include only capabilities established by the user's answers; the two example values above are illustrative, not defaults.

Then a blank line, then your conversational closing for the user. Make it funny, direct, and useful.

Don't output the <<ONBOARDING_COMPLETE>> marker until you actually have the information. If the user asks questions during onboarding, answer briefly then return to the questions.`;

export type OnboardingResult = {
  primaryPersona: PrimaryPersona;
  profileType: ProfileType;
  financialCapabilities: FinancialCapability[];
  filingStatus: FilingStatus;
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
  let parsed: Partial<OnboardingResult>;
  try {
    parsed = JSON.parse(jsonStr) as Partial<OnboardingResult>;
  } catch {
    return null;
  }
  const userVisibleText = (text.slice(0, idx) + after.slice(jsonEnd)).trim();
  const profileType = Object.values(ProfileType).find((value) => value === parsed.profileType)
    ?? ProfileType.UNCLASSIFIED;
  const filingStatus = Object.values(FilingStatus).find((value) => value === parsed.filingStatus)
    ?? FilingStatus.SINGLE;
  const primaryPersona = parsePrimaryPersona(parsed.primaryPersona)
    ?? (profileType === ProfileType.TECH_EMPLOYEE
      ? "TECH_PROFESSIONAL"
      : profileType === ProfileType.S_CORP_OWNER || profileType === ProfileType.SELF_EMPLOYED
        ? "OWNER_OPERATOR"
        : "HIGH_EARNING_PROFESSIONAL");
  const financialCapabilities = parseFinancialCapabilities(parsed.financialCapabilities);
  return {
    result: {
      primaryPersona,
      profileType,
      financialCapabilities: financialCapabilities.length > 0
        ? financialCapabilities
        : deriveCapabilities("", profileType),
      filingStatus,
      state: parsed.state ?? null,
      primaryConcern: parsed.primaryConcern ?? "",
      summary: parsed.summary ?? "",
      suggestedStrategies: parsed.suggestedStrategies ?? [],
    },
    userVisibleText,
  };
}

export function onboardingCapabilityLabels(result: OnboardingResult) {
  return result.financialCapabilities.map((capability) => CAPABILITY_LABELS[capability]);
}
