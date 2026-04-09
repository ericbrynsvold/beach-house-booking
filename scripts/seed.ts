import { config } from "dotenv";
import { resolve } from "path";
import { getDb } from "../src/db";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
import { resources } from "../src/db/schema";

async function main() {
  const db = getDb();
  const existing = await db.select().from(resources).limit(1);
  if (existing.length > 0) {
    console.log("Resources already seeded, skipping.");
    return;
  }
  await db.insert(resources).values([
    { name: "Guest room (queen bed)", sortOrder: 0 },
    { name: "Guest living area (double sofa bed)", sortOrder: 1 },
  ]);
  console.log("Seeded resources.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
