import { z } from "zod";

const EnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  SUPABASE_BUCKET_INCOMING: z.string().default("incoming"),
  SUPABASE_BUCKET_REDACTED: z.string().default("redacted"),
  SUPABASE_BUCKET_SCREENSHOTS: z.string().default("screenshots"),

  DATABASE_URL: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_VISION: z.string().default("gpt-4o-mini"),
  OCRSPACE_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  REPORT_EMAIL_TO: z.string().email().optional(),
  REPORT_EMAIL_FROM: z.string().email().optional(),
  DATA_REQUEST_EMAIL: z.string().email().optional(),

  GITHUB_TOKEN: z.string().optional(),

  // Honeytrap emails (comma-separated)
  HONEYTRAP_EMAILS: z.string().optional(),
  
  // Honeytrap tracking IDs (comma-separated)
  HONEYTRAP_IDS: z.string().optional(),

  // Dedupe tuning
  DEDUP_SIMHASH_DISTANCE: z.coerce.number().default(4),
});

export type AppEnv = z.infer<typeof EnvSchema>;

// Derive a sensible default in Vercel if NEXT_PUBLIC_SITE_URL is not provided
const vercelUrl = process.env.VERCEL_URL;
const derivedSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || (vercelUrl ? `https://${vercelUrl}` : undefined);

export const env: AppEnv = EnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: derivedSiteUrl,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,

  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  SUPABASE_BUCKET_INCOMING: process.env.SUPABASE_BUCKET_INCOMING,
  SUPABASE_BUCKET_REDACTED: process.env.SUPABASE_BUCKET_REDACTED,
  SUPABASE_BUCKET_SCREENSHOTS: process.env.SUPABASE_BUCKET_SCREENSHOTS,

  DATABASE_URL: process.env.DATABASE_URL,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL_VISION: process.env.OPENAI_MODEL_VISION,
  // Accept both OCRSPACE_API_KEY and OCRspace_API_KEY (user typo tolerance)
  OCRSPACE_API_KEY: process.env.OCRSPACE_API_KEY ?? process.env["OCRspace_API_KEY"],

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  // Accept both new and legacy names
  REPORT_EMAIL_TO: process.env.REPORT_EMAIL_TO || process.env.REPORT_TO_EMAIL,
  REPORT_EMAIL_FROM: process.env.REPORT_EMAIL_FROM || process.env.REPORT_FROM_EMAIL,
  DATA_REQUEST_EMAIL: process.env.DATA_REQUEST_EMAIL,

  GITHUB_TOKEN: process.env.GITHUB_TOKEN,

  HONEYTRAP_EMAILS: process.env.HONEYTRAP_EMAILS,
  HONEYTRAP_IDS: process.env.HONEYTRAP_IDS,

  DEDUP_SIMHASH_DISTANCE: process.env.DEDUP_SIMHASH_DISTANCE,
});

