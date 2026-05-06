import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  // SQLite URLs sometimes use "file:" prefix; better-sqlite3 takes a path.
  const filename = url.startsWith("file:") ? url.slice(5) : url;
  const adapter = new PrismaBetterSqlite3({ url: `file:${filename}` });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
