import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AdminInviteForm } from "@/components/admin-invite-form";
import { PageBody, PageHeader } from "@/components/page-header";
import { getCurrentAdminSession } from "@/lib/admin";
import { getCurrentAuthSession } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { AdminInviteCancelButton } from "@/components/admin-invite-cancel-button";

export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  const authSession = await getCurrentAuthSession();
  if (!authSession) redirect("/sign-in?next=%2Fadmin%2Finvites");
  if (!(await getCurrentAdminSession())) notFound();

  const invitations = await prisma.authInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      expiresAt: true,
      acceptedAt: true,
      canceledAt: true,
    },
  });
  // Request-time value used only to label persisted expiration timestamps.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div>
      <PageHeader
        title="Invitations"
        description="Create isolated financial profiles and track who has joined."
      />
      <PageBody className="max-w-6xl">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <AdminInviteForm />

          <section aria-labelledby="google-access-heading" className="rounded-xl bg-zinc-100 p-5 dark:bg-zinc-900 sm:p-6">
            <h2 id="google-access-heading" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Before you send the link
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Google OAuth is currently in Testing. Add the exact invited email as a test user, or Google will reject them after Basis has already rolled out the welcome mat.
            </p>
            <Link
              href="https://console.cloud.google.com/auth/audience?project=basis-finance-rh"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Open Google test users
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </section>
        </div>

        <section aria-labelledby="recent-invites-heading" className="mt-9">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="recent-invites-heading" className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Recent invitations
              </h2>
              <p className="mt-1 text-sm text-zinc-500">Links cannot be recovered after creation because only token hashes are stored.</p>
            </div>
            <span className="text-xs tabular-nums text-zinc-500">{invitations.length} shown</span>
          </div>

          {invitations.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center dark:border-zinc-700">
              <p className="text-sm font-medium">No invitations yet</p>
              <p className="mt-1 text-sm text-zinc-500">Create one above when you are ready to let someone else face their numbers.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/70">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Person</th>
                    <th scope="col" className="px-4 py-3 font-medium">Created</th>
                    <th scope="col" className="px-4 py-3 font-medium">Expires</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {invitations.map((invite) => {
                    const status = invite.acceptedAt
                      ? "Accepted"
                      : invite.canceledAt
                        ? "Canceled"
                        : invite.expiresAt.getTime() <= now
                          ? "Expired"
                          : "Ready";
                    return (
                      <tr key={invite.id}>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{invite.name || "Unnamed invite"}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">{invite.email}</p>
                        </td>
                        <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400">{formatDate(invite.createdAt)}</td>
                        <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400">{formatDate(invite.expiresAt)}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={
                              status === "Ready"
                                ? "inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "inline-flex rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            }
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {status === "Ready" ? <AdminInviteCancelButton inviteId={invite.id} /> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </PageBody>
    </div>
  );
}
