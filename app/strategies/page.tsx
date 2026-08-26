import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { setStrategyStatus, deleteStrategy } from "@/app/actions/strategies";
import type { SuggestionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const SECTIONS: Array<{ status: SuggestionStatus; label: string }> = [
  { status: "NEW", label: "New" },
  { status: "ACKNOWLEDGED", label: "Reviewing" },
  { status: "ACTIONED", label: "Actioned" },
  { status: "DISMISSED", label: "Dismissed" },
];

export default async function StrategiesPage() {
  const user = await getCurrentUser();
  const all = await prisma.strategySuggestion.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (all.length === 0) {
    return (
      <div>
        <PageHeader title="Strategies" description="LLM-surfaced strategies based on your situation" />
        <PageBody>
          <EmptyState
            title="No strategies yet"
            description="Run onboarding to have the assistant suggest strategies tailored to your situation, or ask in chat."
            ctaLabel="Run onboarding"
            ctaHref="/onboarding"
          />
        </PageBody>
      </div>
    );
  }

  const grouped = SECTIONS.map((s) => ({
    ...s,
    items: all.filter((a) => a.status === s.status),
  }));

  return (
    <div>
      <PageHeader title="Strategies" description="LLM-surfaced strategies based on your situation" />
      <PageBody>
        <div className="space-y-8">
          {grouped.map((sec) =>
            sec.items.length > 0 ? (
              <section key={sec.status}>
                <h2 className="mb-3 text-sm font-medium text-zinc-500">{sec.label} ({sec.items.length})</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {sec.items.map((s) => (
                    <Card key={s.id} id={s.id}>
                      <CardHeader>
                        <CardTitle className="text-base text-zinc-900 dark:text-zinc-100">{s.title}</CardTitle>
                        {s.category && (
                          <div className="mt-1 inline-block text-[10px] uppercase tracking-wide bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
                            {s.category}
                          </div>
                        )}
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{s.summary}</p>
                        {s.detail && (
                          <p className="mt-2 text-xs text-zinc-500 whitespace-pre-wrap">{s.detail}</p>
                        )}
                        <div className="mt-4 flex gap-2 flex-wrap">
                          {s.status !== "ACKNOWLEDGED" && (
                            <form action={async () => { "use server"; await setStrategyStatus(s.id, "ACKNOWLEDGED"); }}>
                              <Button size="sm" variant="secondary" type="submit">Reviewing</Button>
                            </form>
                          )}
                          {s.status !== "ACTIONED" && (
                            <form action={async () => { "use server"; await setStrategyStatus(s.id, "ACTIONED"); }}>
                              <Button size="sm" variant="primary" type="submit">Actioned</Button>
                            </form>
                          )}
                          {s.status !== "DISMISSED" && (
                            <form action={async () => { "use server"; await setStrategyStatus(s.id, "DISMISSED"); }}>
                              <Button size="sm" variant="ghost" type="submit">Dismiss</Button>
                            </form>
                          )}
                          <form action={async () => { "use server"; await deleteStrategy(s.id); }}>
                            <Button size="sm" variant="ghost" type="submit" className="text-zinc-400">Delete</Button>
                          </form>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </PageBody>
    </div>
  );
}
