import { Pool, neonConfig } from "@neondatabase/serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NeonQueryResultHKT } from "drizzle-orm/neon-serverless";
import type { PgTransaction } from "drizzle-orm/pg-core";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;
export type DbTransaction = PgTransaction<
  NeonQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export type Db = AppDatabase | DbTransaction;

let cached: AppDatabase | undefined;

export function getDb(): AppDatabase {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!cached) {
    const pool = new Pool({ connectionString: url, max: 5 });
    cached = drizzle(pool, { schema });
  }
  return cached;
}
