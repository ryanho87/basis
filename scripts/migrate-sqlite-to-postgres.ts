import "dotenv/config";

import path from "node:path";
import Database from "better-sqlite3";
import { Client } from "pg";

type Column = { column_name: string; data_type: string; udt_name: string };
type Row = Record<string, unknown>;

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlitePath(value: string) {
  const raw = value.startsWith("file:") ? value.slice(5) : value;
  return path.resolve(raw);
}

function convert(value: unknown, column: Column) {
  if (value === null || value === undefined) return null;
  if (column.data_type === "boolean") return value === true || value === 1 || value === "1" || value === "true";
  if (column.data_type.includes("timestamp") || column.data_type === "date") {
    const date = new Date(value as string | number);
    if (Number.isNaN(date.valueOf())) throw new Error(`Invalid date in ${column.column_name}`);
    return date;
  }
  if (column.data_type === "json" || column.data_type === "jsonb") {
    return typeof value === "string" ? JSON.parse(value) : value;
  }
  return value;
}

function migrationOrder(tables: string[], dependencies: Map<string, Set<string>>) {
  const remaining = new Set(tables);
  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((table) =>
      [...(dependencies.get(table) ?? [])].every((dependency) => !remaining.has(dependency)),
    );
    if (ready.length === 0) {
      throw new Error(`Could not resolve foreign-key order for: ${[...remaining].join(", ")}`);
    }
    ready.sort();
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
  }
  return ordered;
}

async function main() {
  const source = argument("--source") || process.env.SQLITE_DATABASE_URL || "file:./prisma/dev.db";
  const target = argument("--target") || process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL;
  if (!target || !/^postgres(?:ql)?:\/\//.test(target)) {
    throw new Error("Provide a PostgreSQL --target URL or POSTGRES_DATABASE_URL.");
  }

  const sqlite = new Database(sqlitePath(source), { readonly: true, fileMustExist: true });
  const postgres = new Client({ connectionString: target });
  await postgres.connect();

  try {
    const targetTablesResult = await postgres.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`,
    );
    const targetTables = targetTablesResult.rows.map((row) => row.tablename);
    if (targetTables.length === 0) throw new Error("Target has no tables. Run prisma migrate deploy first.");

    const sourceTables = new Set(
      (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'").all() as Array<{ name: string }>).map((row) => row.name),
    );
    const missing = [...sourceTables].filter((table) => !targetTables.includes(table));
    if (missing.length > 0) throw new Error(`Target schema is missing source tables: ${missing.join(", ")}`);

    const nonEmpty: string[] = [];
    for (const table of targetTables) {
      const result = await postgres.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${identifier(table)}`);
      if (Number(result.rows[0]?.count ?? 0) !== 0) nonEmpty.push(table);
    }
    if (nonEmpty.length > 0) {
      throw new Error(`Target must be empty before migration. Non-empty tables: ${nonEmpty.join(", ")}`);
    }

    const dependencyRows = await postgres.query<{ table_name: string; foreign_table_name: string }>(`
      SELECT tc.table_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `);
    const dependencies = new Map<string, Set<string>>();
    for (const row of dependencyRows.rows) {
      if (row.table_name === row.foreign_table_name) continue;
      const set = dependencies.get(row.table_name) ?? new Set<string>();
      set.add(row.foreign_table_name);
      dependencies.set(row.table_name, set);
    }

    const ordered = migrationOrder(targetTables.filter((table) => sourceTables.has(table)), dependencies);
    const columnsByTable = new Map<string, Column[]>();

    await postgres.query("BEGIN");
    for (const table of ordered) {
      const columnsResult = await postgres.query<Column>(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      const columns = columnsResult.rows;
      columnsByTable.set(table, columns);
      const rows = sqlite.prepare(`SELECT * FROM ${identifier(table)}`).all() as Row[];
      if (rows.length === 0) continue;

      const names = columns.map((column) => column.column_name).filter((name) => Object.hasOwn(rows[0], name));
      const selectedColumns = names.map((name) => columns.find((column) => column.column_name === name)!);
      const placeholders = names.map((_, index) => `$${index + 1}`).join(", ");
      const statement = `INSERT INTO ${identifier(table)} (${names.map(identifier).join(", ")}) VALUES (${placeholders})`;
      for (const row of rows) {
        await postgres.query(statement, selectedColumns.map((column) => convert(row[column.column_name], column)));
      }
      console.log(`Copied ${rows.length} rows: ${table}`);
    }

    for (const table of ordered) {
      const sourceCount = Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${identifier(table)}`).get() as { count: number }).count);
      const targetCount = Number((await postgres.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${identifier(table)}`)).rows[0]?.count ?? 0);
      if (sourceCount !== targetCount) throw new Error(`Row-count mismatch for ${table}: ${sourceCount} != ${targetCount}`);

      const numericColumns = (columnsByTable.get(table) ?? []).filter((column) =>
        ["smallint", "integer", "bigint", "numeric", "real", "double precision"].includes(column.data_type),
      );
      for (const column of numericColumns) {
        const sourceSum = Number((sqlite.prepare(`SELECT COALESCE(SUM(CAST(${identifier(column.column_name)} AS REAL)), 0) AS total FROM ${identifier(table)}`).get() as { total: number }).total);
        const targetSum = Number((await postgres.query<{ total: string }>(`SELECT COALESCE(SUM(${identifier(column.column_name)}::double precision), 0)::text AS total FROM ${identifier(table)}`)).rows[0]?.total ?? 0);
        const tolerance = 1e-8 * Math.max(1, Math.abs(sourceSum));
        if (Math.abs(sourceSum - targetSum) > tolerance) {
          throw new Error(`Numeric reconciliation failed for ${table}.${column.column_name}: ${sourceSum} != ${targetSum}`);
        }
      }
    }

    await postgres.query("COMMIT");
    console.log(`Migration complete: ${ordered.length} tables passed row-count and numeric-total reconciliation.`);
  } catch (error) {
    await postgres.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    sqlite.close();
    await postgres.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
});
