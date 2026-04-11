/**
 * Loads .env.local (and .env if present) into process.env.
 * Import this at the top of every script entrypoint before any code that
 * reads env vars. Next.js loads .env.local automatically in app code, but
 * standalone Node scripts don't.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const local = join(ROOT, ".env.local");
const base = join(ROOT, ".env");

if (existsSync(local)) config({ path: local });
if (existsSync(base)) config({ path: base });
