import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db/client";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export async function createTestDb(): Promise<{
  db: AppDatabase;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const directory = path.join(process.cwd(), "src/db/migrations");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(path.join(directory, file), "utf8");
    for (const part of sqlText.split("--> statement-breakpoint")) {
      const executable = part.replace(/--.*$/gm, "").trim();
      if (!executable) continue;
      try {
        await client.exec(part);
      } catch (error) {
        const message = error instanceof Error ? error.message : "migration failed";
        if (executable.includes("CREATE EXTENSION") && /extension|pgcrypto/i.test(message)) {
          continue;
        }
        throw new Error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
      }
    }
  }
  return {
    db: drizzle(client, { schema }) as unknown as AppDatabase,
    close: () => client.close(),
  };
}
