import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.sqlite.prisma",
  migrations: { path: "prisma/migrations.sqlite-archive" },
  datasource: { url: process.env.DATABASE_URL },
});
