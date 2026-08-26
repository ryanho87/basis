import { randomUUID } from "node:crypto";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { Client } from "stytch";
import { auth } from "../lib/auth";

async function main() {
  const projectId = process.env.STYTCH_PROJECT_ID?.trim();
  const secret = process.env.STYTCH_SECRET?.trim();
  const projectDomain = process.env.NEXT_PUBLIC_STYTCH_PROJECT_DOMAIN?.trim().replace(/\/$/, "");
  const profileId = process.env.STYTCH_TRUSTED_AUTH_TOKEN_PROFILE_ID?.trim();
  if (!projectId || !secret || !projectDomain || !profileId) throw new Error("Stytch environment is incomplete.");

  const nonce = randomUUID();
  const subject = `basis-oauth-verification-${nonce}`;
  const email = `${subject}@example.invalid`;
  const { token } = await auth.api.signJWT({
    body: {
      payload: {
        sub: subject,
        email,
        email_verified: true,
        name: "Basis OAuth verification",
        jti: nonce,
        iat: Math.floor(Date.now() / 1000),
      },
    },
  });
  const claims = decodeJwt(token);
  const protectedHeader = decodeProtectedHeader(token);
  console.log(JSON.stringify({
    tokenHeader: { alg: protectedHeader.alg, kid: protectedHeader.kid },
    tokenClaims: {
      issuer: claims.iss,
      audience: claims.aud,
      hasEmail: typeof claims.email === "string",
      hasTokenId: typeof claims.jti === "string",
      hasSubject: typeof claims.sub === "string",
    },
  }));

  const stytch = new Client({ project_id: projectId, secret, custom_base_url: projectDomain });
  let stytchUserId: string | undefined;
  let sessionToken: string | undefined;
  try {
    const attested = await stytch.sessions.attest({
      profile_id: profileId,
      token,
      session_duration_minutes: 5,
    });
    stytchUserId = attested.user_id;
    sessionToken = attested.session_token;
    console.log(JSON.stringify({ attestation: "ok", externalIdMapped: attested.user.external_id === subject }));
  } finally {
    if (sessionToken) await stytch.sessions.revoke({ session_token: sessionToken }).catch(() => undefined);
    if (stytchUserId) await stytch.users.delete({ user_id: stytchUserId }).catch(() => undefined);
  }
}

main().catch((error) => {
  const diagnostic = error && typeof error === "object"
    ? {
        errorType: "error_type" in error ? String(error.error_type) : "unknown_error",
        errorMessage: "error_message" in error ? String(error.error_message) : error instanceof Error ? error.message : "Unknown error",
        statusCode: "status_code" in error ? Number(error.status_code) : undefined,
      }
    : { errorType: "unknown_error", errorMessage: String(error), statusCode: undefined };
  console.error(`Stytch attestation failed: ${JSON.stringify(diagnostic)}`);
  process.exitCode = 1;
});
