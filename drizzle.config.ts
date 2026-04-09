import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { resolve } from "path";

// Next.js uses .env.local for secrets; drizzle-kit only loads .env by default.
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Add it to .env.local (or .env) — drizzle-kit does not read Next.js env files automatically unless loaded here.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
