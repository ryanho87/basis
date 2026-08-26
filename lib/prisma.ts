import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient as SqlitePrismaClient } from "@/app/generated/prisma-sqlite";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const log = process.env.NODE_ENV === "development" ? ["error", "warn"] as const : ["error"] as const;

  if (url.startsWith("file:")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Production requires a durable PostgreSQL DATABASE_URL; SQLite is intentionally disabled.");
    }
    const adapter = new PrismaBetterSqlite3({ url });
    return new SqlitePrismaClient({ adapter, log: [...log] }) as unknown as PrismaClient;
  }

  if (!/^postgres(?:ql)?:\/\//.test(url)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL (or a file: URL for local development only).");
  }

  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: [...log],
  });
}

export const databaseProvider = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").startsWith("file:")
  ? "sqlite"
  : "postgresql";

export const prisma = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
