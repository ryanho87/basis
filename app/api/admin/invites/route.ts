import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin";
import { hashInviteToken } from "@/lib/invite-token";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type InviteRequest = {
  name?: unknown;
  email?: unknown;
  hours?: unknown;
};

type InviteFieldErrors = {
  name?: string;
  email?: string;
  hours?: string;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return NextResponse.json({ message: "Expected JSON." }, { status: 415 });
  }

  const adminSession = await getCurrentAdminSession();
  if (!adminSession) {
    return NextResponse.json(
      { message: "You are not authorized to create invitations." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as InviteRequest | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const name = textValue(body.name);
  const email = textValue(body.email).toLowerCase();
  const hours = Number(textValue(body.hours) || "72");
  const fieldErrors: InviteFieldErrors = {};

  if (name.length < 2 || name.length > 80) {
    fieldErrors.name = "Use a name between 2 and 80 characters.";
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter the Google email they will use to sign in.";
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
    fieldErrors.hours = "Expiration must be between 1 and 168 hours.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { message: "Fix the fields below and try again.", fieldErrors },
      { status: 400 },
    );
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  try {
    await prisma.$transaction(async (tx) => {
      const existingIdentity = await tx.authUser.findUnique({ where: { email } });
      if (existingIdentity) throw new Error("IDENTITY_EXISTS");

      const existingProfile = await tx.user.findUnique({
        where: { email },
        select: { id: true, authIdentity: { select: { id: true } } },
      });
      if (existingProfile?.authIdentity) throw new Error("IDENTITY_EXISTS");

      const previousInvite = await tx.authInvite.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
        select: { profileUserId: true },
      });
      const previousProfile = previousInvite
        ? await tx.user.findUnique({
            where: { id: previousInvite.profileUserId },
            select: { id: true, authIdentity: { select: { id: true } } },
          })
        : null;

      const reusableProfileId = existingProfile?.id
        ?? (previousProfile && !previousProfile.authIdentity ? previousProfile.id : null);
      const profile = reusableProfileId
        ? await tx.user.update({ where: { id: reusableProfileId }, data: { email, name } })
        : await tx.user.create({ data: { email, name } });

      await tx.authInvite.deleteMany({ where: { email, acceptedAt: null, canceledAt: null } });
      await tx.authInvite.create({
        data: {
          email,
          name,
          tokenHash: hashInviteToken(token),
          profileUserId: profile.id,
          expiresAt,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "IDENTITY_EXISTS") {
      return NextResponse.json(
        { message: "That email already has a Basis login." },
        { status: 409 },
      );
    }
    console.error("Admin invitation creation failed", error);
    return NextResponse.json(
      { message: "Basis could not create the invitation. Try again." },
      { status: 500 },
    );
  }

  const configuredBaseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  const baseUrl = configuredBaseUrl || requestUrl.origin;
  return NextResponse.json({
    message: "Invitation created. Copy it now; Basis stores only a hash of the token.",
    inviteUrl: `${baseUrl}/sign-up#invite=${token}`,
    invitedEmail: email,
    expiresAt: expiresAt.toISOString(),
  });
}
