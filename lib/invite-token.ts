import { createHash } from "node:crypto";

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
