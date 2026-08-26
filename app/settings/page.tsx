import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { isAdminEmail } from "@/lib/admin";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateUserTaxSettings } from "@/app/actions/income";
import { revalidatePath } from "next/cache";
import { ProfileType } from "@prisma/client";
import { UserPlus } from "lucide-react";
import {
  CAPABILITY_LABELS,
  deriveCapabilities,
  derivePersona,
  parsePrimaryPersona,
  personaLabel,
} from "@/lib/profile-capabilities";

export const dynamic = "force-dynamic";

async function updateProfile(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  const requestedProfileType = formData.get("profileType");
  const profileType = Object.values(ProfileType).find((value) => value === requestedProfileType)
    ?? ProfileType.UNCLASSIFIED;
  const primaryPersona = parsePrimaryPersona(formData.get("primaryPersona"));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: (formData.get("name") as string) || null,
      profileType,
      primaryPersona,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/");
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const data = await prisma.user.findUnique({ where: { id: user.id } });
  if (!data) return null;
  const persona = derivePersona(data.primaryPersona, data.profileType);
  const capabilities = deriveCapabilities(data.financialCapabilitiesJson, data.profileType);
  const remoteMcpConfigured = Boolean(
    process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN?.trim()
      && process.env.NEXT_PUBLIC_STYTCH_PROJECT_DOMAIN?.trim()
      && process.env.STYTCH_PROJECT_ID?.trim()
      && process.env.STYTCH_SECRET?.trim()
      && process.env.STYTCH_TRUSTED_AUTH_TOKEN_PROFILE_ID?.trim(),
  );

  return (
    <div>
      <PageHeader title="Settings" />
      <PageBody>
        <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateProfile} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={data.name ?? ""} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="primaryPersona">Primary profile</Label>
                  <Select id="primaryPersona" name="primaryPersona" defaultValue={persona} className="mt-1">
                    <option value="TECH_PROFESSIONAL">Tech professional</option>
                    <option value="PHYSICIAN">Physician</option>
                    <option value="OWNER_OPERATOR">Business owner</option>
                    <option value="HIGH_EARNING_PROFESSIONAL">High-earning professional</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="profileType">Profile type</Label>
                  <Select id="profileType" name="profileType" defaultValue={data.profileType} className="mt-1">
                    <option value="UNCLASSIFIED">Unclassified</option>
                    <option value="TECH_EMPLOYEE">Tech Employee (W-2 + equity)</option>
                    <option value="W2_PROFESSIONAL">W-2 Professional (no equity)</option>
                    <option value="S_CORP_OWNER">S-Corp Owner</option>
                    <option value="SELF_EMPLOYED">Self-employed / 1099</option>
                    <option value="MIXED">Mixed</option>
                  </Select>
                </div>
                {capabilities.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-zinc-500">Active capabilities</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {capabilities.map((capability) => (
                        <span key={capability} className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {CAPABILITY_LABELS[capability]}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">Re-run onboarding to update capabilities.</p>
                  </div>
                ) : null}
                <Button type="submit" size="sm">Save</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tax filing</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateUserTaxSettings} className="space-y-4">
                <div>
                  <Label htmlFor="filingStatus">Filing status</Label>
                  <Select id="filingStatus" name="filingStatus" defaultValue={data.filingStatus} className="mt-1">
                    <option value="SINGLE">Single</option>
                    <option value="MARRIED_FILING_JOINTLY">Married filing jointly</option>
                    <option value="MARRIED_FILING_SEPARATELY">Married filing separately</option>
                    <option value="HEAD_OF_HOUSEHOLD">Head of household</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" defaultValue={data.state ?? ""} className="mt-1" placeholder="CA, NY, TX…" />
                </div>
                <Button type="submit" size="sm">Save</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 max-w-4xl">
          <CardHeader>
            <CardTitle>{personaLabel(persona)} profile</CardTitle>
          </CardHeader>
          <CardContent>
            {data.onboardingSummary ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{data.onboardingSummary}</p>
            ) : (
              <p className="text-sm text-zinc-500">No summary yet — run onboarding.</p>
            )}
            {data.primaryConcern && (
              <p className="mt-3 text-xs text-zinc-500">
                <span className="font-medium">Primary concern:</span> {data.primaryConcern}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 max-w-4xl">
          <CardHeader>
            <CardTitle>AI connections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {remoteMcpConfigured ? "Ready for secure ChatGPT and Claude connections." : "Remote AI connections are not configured yet."}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Read-only OAuth access. Connections can inspect Basis data but cannot move money, trade, or retrieve provider credentials.
                </p>
              </div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${remoteMcpConfigured ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
                {remoteMcpConfigured ? "Enabled" : "Setup required"}
              </span>
            </div>
            {remoteMcpConfigured ? (
              <div className="mt-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
                <p className="text-xs font-medium text-zinc-500">Remote MCP URL</p>
                <code className="mt-1 block break-all text-sm text-zinc-800 dark:text-zinc-200">{`${process.env.BETTER_AUTH_URL?.replace(/\/$/, "")}/api/mcp`}</code>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {isAdminEmail(data.email) ? (
          <section className="mt-8 max-w-4xl border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Administration</h2>
                <p className="mt-1 text-sm text-zinc-500">Invite people without performing terminal archaeology.</p>
              </div>
              <Link
                href="/admin/invites"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Manage invitations
              </Link>
            </div>
          </section>
        ) : null}
      </PageBody>
    </div>
  );
}
