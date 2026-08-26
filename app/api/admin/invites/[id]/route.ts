import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/admin/invites/[id]">,
) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  if (!(await getCurrentAdminSession())) {
    return NextResponse.json(
      { message: "You are not authorized to cancel invitations." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!id || id.length > 64) {
    return NextResponse.json({ message: "Invalid invitation." }, { status: 400 });
  }

  const canceledAt = new Date();
  const result = await prisma.authInvite.updateMany({
    where: {
      id,
      acceptedAt: null,
      canceledAt: null,
      expiresAt: { gt: canceledAt },
    },
    data: { canceledAt },
  });

  if (result.count !== 1) {
    return NextResponse.json(
      { message: "That invitation is already accepted, expired, canceled, or missing." },
      { status: 409 },
    );
  }

  return NextResponse.json({ message: "Invitation canceled." });
}
