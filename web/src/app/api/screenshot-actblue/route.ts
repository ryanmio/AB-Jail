/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { internalHeaders } from "@/lib/internal-auth";
export const runtime = "nodejs";
// Whole route is bounded at ~15s of capture plus an upload; anything longer is a hang.
export const maxDuration = 60;
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { env } from "@/lib/env";

// Lazy import puppeteer deps to avoid edge bundling issues when route is untouched
async function getChromium() {
  const mod = await import("@sparticuz/chromium");
  return (mod as any).default ?? mod;
}
async function getPuppeteerCore() {
  const mod = await import("puppeteer-core");
  return (mod as any).default ?? mod;
}

function isValidActBlueUrl(input: string): boolean {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "actblue.com" || host.endsWith(".actblue.com");
  } catch {
    return false;
  }
}

function resolveLocalChromePath(): string | null {
  const envPath = process.env.CHROME_PATH;
  if (envPath && typeof envPath === "string") return envPath;
  // Common macOS locations
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

type Body = { caseId?: string; url?: string };

// browser.close() can hang indefinitely on serverless chromium, which held the
// HTTP response open after the screenshot had already been saved. Give close a
// short window, then kill the process outright so the response goes out.
async function closeBrowser(browser: any): Promise<void> {
  if (!browser) return;
  const proc = typeof browser.process === "function" ? browser.process() : null;
  try {
    await Promise.race([
      browser.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {}
  try {
    if (proc && proc.exitCode === null && !proc.killed) proc.kill("SIGKILL");
  } catch {}
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "service_key_missing" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const json = (await req.json().catch(() => null)) as Body | null;
  const caseId = String(json?.caseId || "").trim();
  const url = String(json?.url || "").trim();
  if (!caseId || !url) return NextResponse.json({ error: "missing_args" }, { status: 400 });
  if (!isValidActBlueUrl(url)) return NextResponse.json({ error: "invalid_url" }, { status: 400 });

  // Mark pending state immediately so UI can reflect
  await supabase
    .from("submissions")
    .update({ landing_url: url, landing_render_status: "pending" })
    .eq("id", caseId);

  // Upsert a single landing_page context comment (not shown in UI)
  try {
    const contextText = `landing_page: ${url}`;
    await supabase.from("comments").insert({ submission_id: caseId, content: contextText, kind: "landing_page" });
  } catch {}

  // Attempt screenshot with hard 15s timeout (launch + navigate + capture)
  const timeoutMs = 15000;
  let screenshotBuf: Buffer | null = null;
  let browser: any = null;
  // Set when the deadline fires. If that happens while puppeteer.launch() is
  // still in flight, `browser` is null so the catch block below can't close
  // it; takeShot checks this flag right after launch and closes it itself.
  // Without this the chromium process kept running (and burning CPU) after
  // the function had already responded.
  let abandoned = false;
  let step: "launch" | "navigate" | "screenshot" | "upload" | "unknown" = "launch";
  async function takeShot(): Promise<Buffer> {
    const chromium: any = await getChromium();
    const puppeteer: any = await getPuppeteerCore();
    let executablePath: string | null = null;
    try {
      executablePath = await chromium.executablePath();
    } catch {}
    if (!executablePath) executablePath = resolveLocalChromePath();
    const args: string[] = Array.isArray(chromium.args) ? chromium.args.slice() : [];
    // Harden for local/docker/vercel
    for (const a of ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--hide-scrollbars","--ignore-certificate-errors","--window-size=1280,2000"]) {
      if (!args.includes(a)) args.push(a);
    }
    try {
      browser = await puppeteer.launch({
        args,
        defaultViewport: chromium.defaultViewport || { width: 1280, height: 1200 },
        executablePath: executablePath || undefined,
        headless: (chromium.headless as boolean) ?? true,
      });
    } catch {
      // Retry using system Chrome if the downloaded chromium path is not executable
      const localExe = resolveLocalChromePath();
      if (!localExe) throw new Error("No Chrome executable found");
      browser = await puppeteer.launch({
        args,
        defaultViewport: { width: 1280, height: 1200 },
        executablePath: localExe,
        headless: true,
      });
    }
    if (abandoned) {
      await closeBrowser(browser);
      throw new Error("timeout");
    }
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);
    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      );
    } catch {}
    try {
      await page.setViewport({ width: 1280, height: 1200, deviceScaleFactor: 1 });
    } catch {}
    step = "navigate";
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("body", { timeout: 5000 });
    // Give dynamic form widgets a moment to hydrate and render
    try { await page.waitForNetworkIdle({ idleTime: 1500, timeout: 6000 }); } catch {}
    // ActBlue shows a transient "Loading Form..." message; wait for it to disappear when possible
    try {
      await page.waitForFunction(() => {
        try {
          const txt = document.body?.innerText || "";
          return !/Loading\s*Form/i.test(txt);
        } catch { return true; }
      }, { timeout: 6000 });
    } catch {}
    step = "screenshot";
    const buf = (await page.screenshot({ fullPage: true, type: "png" })) as Buffer;
    return buf;
  }
  let deadline: ReturnType<typeof setTimeout> | null = null;
  const startedAt = Date.now();
  const targetHost = (() => { try { return new URL(url).hostname; } catch { return null; } })();
  try {
    screenshotBuf = await Promise.race([
      takeShot(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          abandoned = true;
          reject(new Error("timeout"));
        }, timeoutMs);
      }),
    ]) as Buffer;
  } catch (e) {
    // Structured failure record so the Vercel logs answer "which step, how long, which host".
    console.error("/api/screenshot-actblue:failed", {
      caseId,
      step,
      elapsedMs: Date.now() - startedAt,
      host: targetHost,
      error: e instanceof Error ? e.message : String(e),
    });
    // Mark failure and return, but keep the comment we inserted earlier
    await supabase
      .from("submissions")
      .update({ landing_render_status: "failed", landing_rendered_at: new Date().toISOString() })
      .eq("id", caseId);
    // Kill chromium now rather than letting it finish an unwanted render.
    await closeBrowser(browser);
    return NextResponse.json({ ok: false, error: "screenshot_failed", step }, { status: 502 });
  } finally {
    if (deadline) clearTimeout(deadline);
  }

  try {
    // Upload to Supabase Storage
    step = "upload";
    const bucket = env.SUPABASE_BUCKET_SCREENSHOTS || "screenshots";
    const objectPath = `${caseId}-${randomUUID()}.png`;
    // Convert Node Buffer to ArrayBuffer for Supabase upload
    const ab = (screenshotBuf as Buffer).buffer.slice((screenshotBuf as Buffer).byteOffset, (screenshotBuf as Buffer).byteOffset + (screenshotBuf as Buffer).byteLength);
    // Assume bucket exists in Supabase project configuration
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(objectPath, ab as ArrayBuffer, {
        contentType: "image/png",
        upsert: false,
        cacheControl: "3600",
      });
    if (upErr) throw upErr;
    const publicUrl = `supabase://${bucket}/${objectPath}`;

    await supabase
      .from("submissions")
      .update({
        landing_url: url,
        landing_screenshot_url: publicUrl,
        landing_rendered_at: new Date().toISOString(),
        landing_render_status: "success",
      })
      .eq("id", caseId);

    // Update landing_page context with screenshot link via a second insert (still hidden in UI)
    try {
      const comment = `landing_page: ${url}\nscreenshot: ${publicUrl}`;
      await supabase.from("comments").insert({ submission_id: caseId, content: comment, kind: "landing_page" });
    } catch {}

    // Fire-and-forget classify with existing comments included
    try {
      const base = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      void fetch(`${base}/api/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...internalHeaders() },
        body: JSON.stringify({ submissionId: caseId, includeExistingComments: true }),
      }).catch(() => undefined);
    } catch {}

    // Fire-and-forget sender re-extraction with landing page screenshot
    try {
      const base = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      void fetch(`${base}/api/sender`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...internalHeaders() },
        body: JSON.stringify({ submissionId: caseId }),
      }).catch(() => undefined);
    } catch {}

    console.log("/api/screenshot-actblue:ok", { caseId, elapsedMs: Date.now() - startedAt, host: targetHost, bytes: screenshotBuf?.byteLength ?? 0 });
    return NextResponse.json({ ok: true, screenshotUrl: publicUrl });
  } catch (e) {
    console.error("/api/screenshot-actblue:failed", {
      caseId,
      step,
      elapsedMs: Date.now() - startedAt,
      host: targetHost,
      error: e instanceof Error ? e.message : String(e),
    });
    await supabase
      .from("submissions")
      .update({ landing_render_status: "failed", landing_rendered_at: new Date().toISOString() })
      .eq("id", caseId);
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  } finally {
    await closeBrowser(browser);
  }
}


