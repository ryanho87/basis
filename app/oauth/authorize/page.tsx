import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StytchOAuthAuthorize } from "@/components/stytch-oauth-authorize";
import { auth } from "@/lib/auth";

type SearchParams = Record<string, string | string[] | undefined>;

function returnPath(searchParams: SearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (value !== undefined) query.set(key, value);
  }
  const serialized = query.toString();
  return `/oauth/authorize${serialized ? `?${serialized}` : ""}`;
}

export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const requestHeaders = await headers();
  const params = await searchParams;
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(returnPath(params))}`);

  const publicToken = process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN?.trim();
  const projectDomain = process.env.NEXT_PUBLIC_STYTCH_PROJECT_DOMAIN?.trim().replace(/\/$/, "");
  const tokenProfileId = process.env.STYTCH_TRUSTED_AUTH_TOKEN_PROFILE_ID?.trim();
  if (!publicToken || !projectDomain || !tokenProfileId) {
    throw new Error("Stytch remote MCP is not configured. Add its public token and Trusted Auth Token Profile ID in Vercel.");
  }

  const { token } = await auth.api.getToken({ headers: requestHeaders });
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-4 text-sm text-zinc-500">Basis secure connection</p>
        <StytchOAuthAuthorize
          projectDomain={projectDomain}
          publicToken={publicToken}
          trustedAuthToken={token}
          tokenProfileId={tokenProfileId}
        />
      </section>
    </main>
  );
}
