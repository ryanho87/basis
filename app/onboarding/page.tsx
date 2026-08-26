import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { PageBody, PageHeader } from "@/components/page-header";
import { OnboardingChat } from "@/components/onboarding-chat";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { CAPABILITY_LABELS, deriveCapabilities, derivePersona, personaLabel } from "@/lib/profile-capabilities";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: { strategySuggestions: { where: { status: { in: ["NEW", "ACKNOWLEDGED"] } } } },
  });
  const persona = data ? derivePersona(data.primaryPersona, data.profileType) : null;
  const capabilities = data ? deriveCapabilities(data.financialCapabilitiesJson, data.profileType) : [];

  return (
    <div>
      <PageHeader
        title={data?.onboardedAt ? "Re-do onboarding" : "Onboarding"}
        description={
          data?.onboardedAt
            ? "Run through onboarding again to refresh your profile and suggestions"
            : "Quick chat — the assistant will recommend a profile and surface relevant strategies"
        }
      />
      <PageBody>
        {data?.onboardedAt && (
          <Card className="mb-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4 flex gap-3">
              <Sparkles className="size-5 text-emerald-600 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Profile: {persona ? personaLabel(persona) : "Unclassified"}</div>
                {data.onboardingSummary && (
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">{data.onboardingSummary}</p>
                )}
                {capabilities.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {capabilities.map((capability) => (
                      <span key={capability} className="rounded-full bg-white/80 px-2 py-1 text-[11px] text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                        {CAPABILITY_LABELS[capability]}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
        <OnboardingChat />
      </PageBody>
    </div>
  );
}
