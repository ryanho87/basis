import "server-only";

import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { jwt } from "better-auth/plugins";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { getValidInvite, getValidInviteForEmail } from "@/lib/auth-invite";
import { INVITE_COOKIE } from "@/lib/auth-shared";
import { BASIS_OAUTH_ISSUER, BASIS_ORIGIN } from "@/lib/mcp/config";
import { databaseProvider, prisma } from "@/lib/prisma";

function requestInviteToken(context: { request?: Request } | null | undefined) {
  const cookieHeader = context?.request?.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === INVITE_COOKIE) return decodeURIComponent(valueParts.join("=")).trim();
  }
  return "";
}

function isGoogleCallback(context: { request?: Request } | null | undefined) {
  const requestUrl = context?.request?.url;
  if (!requestUrl) return false;

  try {
    return new URL(requestUrl).pathname.endsWith("/api/auth/callback/google");
  } catch {
    return false;
  }
}

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const passwordAuthEnabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_PASSWORD_AUTH === "true";

export const auth = betterAuth({
  appName: "Basis",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: BASIS_ORIGIN,
  database: prismaAdapter(prisma, { provider: databaseProvider }),
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            prompt: "select_account",
          },
        }
      : {},
  user: {
    modelName: "AuthUser",
    additionalFields: {
      profileUserId: {
        type: "string",
        required: false,
        input: false,
        returned: false,
      },
    },
  },
  session: {
    modelName: "AuthSession",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  account: {
    modelName: "AuthAccount",
    encryptOAuthTokens: true,
  },
  verification: {
    modelName: "AuthVerification",
    storeIdentifier: "hashed",
  },
  emailAndPassword: {
    enabled: passwordAuthEnabled,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (candidate, context) => {
          const token = requestInviteToken(context);
          const invite = token
            ? await getValidInvite(token)
            : isGoogleCallback(context)
              ? await getValidInviteForEmail(candidate.email)
              : null;
          if (!invite || invite.email.toLowerCase() !== candidate.email.toLowerCase()) {
            throw new APIError("FORBIDDEN", {
              message: "This invitation is invalid, expired, or intended for another email address.",
            });
          }

          const claimed = await prisma.authInvite.updateMany({
            where: { id: invite.id, acceptedAt: null, canceledAt: null, expiresAt: { gt: new Date() } },
            data: { acceptedAt: new Date() },
          });
          if (claimed.count !== 1) {
            throw new APIError("FORBIDDEN", { message: "This invitation has already been used." });
          }

          await prisma.user.update({
            where: { id: invite.profileUserId },
            data: { email: candidate.email.toLowerCase(), name: candidate.name },
          });

          return {
            data: {
              ...candidate,
              email: candidate.email.toLowerCase(),
              profileUserId: invite.profileUserId,
            },
          };
        },
      },
    },
  },
  plugins: [
    jwt({
      jwt: {
        issuer: BASIS_OAUTH_ISSUER,
        audience: BASIS_ORIGIN,
        expirationTime: "5 minutes",
        definePayload: ({ user }) => ({
          email: user.email,
          email_verified: user.emailVerified,
          name: user.name,
          jti: crypto.randomUUID(),
        }),
      },
      // Stytch Trusted Auth Token Profiles accept the RSA JWKS flow used by
      // external identity providers. Keep this bridge short-lived and scoped
      // to attestation; Stytch issues the actual Connected Apps access token.
      jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
    }),
    nextCookies(),
  ],
});

export type BasisAuthSession = typeof auth.$Infer.Session;
