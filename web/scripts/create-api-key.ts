/**
 * Generate a new API key and insert it into the api_keys table.
 *
 * Usage (run from the web/ directory):
 *   npx tsx scripts/create-api-key.ts --name "Jane Reporter" --email "jane@news.org" --description "Investigative reporting"
 *
 * Requires SUPABASE env vars in .env.local
 */

import { randomBytes, createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "web", ".env.local"),
  ];
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
      return;
    } catch {
      // Try next candidate
    }
  }
}

function parseArgs(): { name: string; email: string; description?: string } {
  const args = process.argv.slice(2);
  let name = "";
  let email = "";
  let description = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) name = args[++i];
    else if (args[i] === "--email" && args[i + 1]) email = args[++i];
    else if (args[i] === "--description" && args[i + 1]) description = args[++i];
  }

  if (!name || !email) {
    console.error(
      'Usage: npx tsx scripts/create-api-key.ts --name "Name" --email "email@example.com" [--description "..."]'
    );
    process.exit(1);
  }

  return { name, email, description: description || undefined };
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
    console.error("Make sure .env.local exists in the web/ directory, or run this script from web/.");
    process.exit(1);
  }

  const { name, email, description } = parseArgs();

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(32);
  let suffix = "";
  for (let i = 0; i < 32; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  const rawKey = `abjail_${suffix}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 14);

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from("api_keys").insert({
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name,
    email,
    description: description || null,
  });

  if (error) {
    console.error("Failed to insert API key:", error.message);
    process.exit(1);
  }

  console.log("\n=== API Key Created ===");
  console.log(`Name:    ${name}`);
  console.log(`Email:   ${email}`);
  console.log(`Prefix:  ${keyPrefix}`);
  console.log(`\nAPI Key: ${rawKey}`);
  console.log(
    "\nSave this key now -- it cannot be retrieved again.\n"
  );
}

main();
