import { NextResponse } from "next/server";
import { INVITE_COOKIE } from "@/lib/auth-shared";
import { getInvitePreview } from "@/lib/auth-invite";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (token.length < 32 || token.length > 256 || !(await getInvitePreview(token))) {
    return NextResponse.json({ error: "This invitation is invalid, expired, or already used." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(INVITE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
    priority: "high",
  });
  return response;
}
