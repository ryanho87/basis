import "dotenv/config";

import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { hashInviteToken } from "../lib/invite-token";

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const email = valueAfter("--email")?.toLowerCase();
  const name = valueAfter("--name");
  const claimExisting = process.argv.includes("--claim-existing");
  const expiresInHours = Number(valueAfter("--hours") ?? "72");

  if (!email || !email.includes("@")) {
    throw new Error("Provide a valid --email address.");
  }
  if (!name || name.length < 2) {
    throw new Error("Provide the invitee's name with --name.");
  }
  if (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) {
    throw new Error("--hours must be between 1 and 168.");
  }

  const existingIdentity = await prisma.authUser.findUnique({ where: { email } });
  if (existingIdentity) throw new Error("That email already has a Basis login.");

  let profile;
  if (claimExisting) {
    profile = await prisma.user.findFirst({
      where: { authIdentity: null },
      orderBy: { createdAt: "asc" },
    });
    if (!profile) throw new Error("No unclaimed financial profile exists.");
  } else {
    profile = await prisma.user.create({ data: { email, name } });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  await prisma.authInvite.create({
    data: {
      email,
      name,
      tokenHash: hashInviteToken(token),
      profileUserId: profile.id,
      expiresAt,
    },
  });

  const baseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";
  console.log(`Invite for ${email}`);
  // Fragments are not sent in HTTP requests. The sign-up page exchanges this
  // value for a short-lived HttpOnly cookie and immediately removes it from history.
  console.log(`${baseUrl}/sign-up#invite=${token}`);
  console.log(`Expires ${expiresAt.toISOString()}`);
  if (claimExisting) console.log(`Claims existing financial profile ${profile.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Invite creation failed");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
