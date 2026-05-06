import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { PageBody, PageHeader } from "@/components/page-header";
import { OnboardingChat } from "@/components/onboarding-chat";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: { strategySuggestions: { where: { status: { in: ["NEW", "ACKNOWLEDGED"] } } } },
  });

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
                <div className="font-medium">Profile: {data.profileType.replace(/_/g, " ").toLowerCase()}</div>
                {data.onboardingSummary && (
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">{data.onboardingSummary}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        <OnboardingChat />
      </PageBody>
    </div>
  );
}
