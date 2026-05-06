import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateUserTaxSettings } from "@/app/actions/income";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function updateProfile(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: (formData.get("name") as string) || null,
      profileType: (formData.get("profileType") as any) || "UNCLASSIFIED",
    },
  });
  revalidatePath("/settings");
  revalidatePath("/");
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const data = await prisma.user.findUnique({ where: { id: user.id } });
  if (!data) return null;

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
            <CardTitle>Onboarding summary</CardTitle>
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
      </PageBody>
    </div>
  );
}
