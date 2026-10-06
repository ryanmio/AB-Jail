/* eslint-disable @typescript-eslint/no-explicit-any */
import { truncateForAI } from "./constants";
import { alertPipelineFailure } from "@/lib/pipeline-alert";

export interface PIIDetectionResult {
  strings_to_redact: string[];
  confidence: number;
}

/**
 * Detect submitter's PII (name and email) from message content using AI.
 * Uses text analysis to identify the person who forwarded/submitted the message.
 */
export async function detectPII(
  rawText: string,
  emailFrom?: string | null
): Promise<PIIDetectionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn("detectPII:no_api_key");
    return {
      strings_to_redact: [],
      confidence: 0,
    };
  }

  const model = "gpt-5-mini-2025-08-07";

  const system = `You are identifying PERSONAL INFORMATION that should be redacted from a political fundraising message.

Your task: Find ALL variations of the recipient's personal information (name variants, email addresses) that appear in the message. Do NOT redact the sender's or signer's name.

Return EVERY string that should be replaced with asterisks. Include:
- Full name: "Ryan Mioduski"
- First name standalone: "Ryan" (if used in personalization like "Hi Ryan," or "Ryan, this is...")
- Name with punctuation: "Ryan," or "Ryan."
- Name variations: "R. Mioduski", "R Mioduski"
- Email addresses: "ryan@mioduski.us"
- Any other personal identifiers

DO NOT include:
- Organization names
- Political candidate names being discussed
- PAC/committee names
- Organization email addresses (like @dccc.org, @actblue.com)
-- Names of senders, sign-offs, or signers of the email (for example, the candidate or public figure whose name appears after "Thanks," in the signature)
- Common words that happen to match a first name in non-personalized context

Return STRICT JSON only (no markdown):
{
  "strings_to_redact": ["string1", "string2", ...],
  "confidence": <number between 0 and 1>
}

Examples:
- Input: "Hi Ryan, this is for Ryan Mioduski" → {"strings_to_redact": ["Ryan Mioduski", "Ryan"], "confidence": 0.9}
- Input: "NAME: Ryan Mioduski\nContact: ryan@mioduski.us" → {"strings_to_redact": ["Ryan Mioduski", "ryan@mioduski.us"], "confidence": 0.95}
- Input: "From: R. Mioduski <ryan@gmail.com>" → {"strings_to_redact": ["R. Mioduski", "ryan@gmail.com"], "confidence": 0.9}
- Input: "Dear Friend, donate now!" → {"strings_to_redact": [], "confidence": 0.95}
- Input: "Can I count on you?\n\nThanks,\nNancy Pelosi" → {"strings_to_redact": [], "confidence": 0.95}

IMPORTANT: Return the exact strings as they appear in the text. If "Ryan," appears with a comma, include it. Be thorough - find ALL variations.

Be conservative with confidence. Only return high confidence (≥0.7) when you find clear personalized content.`;

  type Message = { role: "system" | "user"; content: string };
  
  // Build message text and apply character limit to prevent abuse
  let messageText = "";
  if (emailFrom) {
    messageText += `From: ${emailFrom}\n\n`;
  }
  messageText += String(rawText || "").trim() || "(none)";
  messageText = truncateForAI(messageText);
  
  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: messageText },
  ];

  try {
    console.log("detectPII:calling_openai", { 
      model, 
      textLength: messageText.length,
      hasEmailFrom: !!emailFrom,
    });
    
    const startTime = Date.now();
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        Authorization: `Bearer ${apiKey}` 
      },
      body: JSON.stringify({ 
        model, 
        messages,
        reasoning_effort: "low",
        verbosity: "low",
      }),
    });
    
    const elapsed = Date.now() - startTime;
    
    if (!resp.ok) {
      const errorBody = await resp.json().catch(() => null);
      console.error("detectPII:openai_failed", { 
        status: resp.status, 
        elapsed,
        error: JSON.stringify(errorBody),
      });
      await alertPipelineFailure({ step: "redact-pii", status: resp.status, detail: errorBody });
      
      return {
        strings_to_redact: [],
        confidence: 0,
      };
    }
    
    const json = await resp.json();
    const content = (json as any)?.choices?.[0]?.message?.content?.trim() || "{}";
    
    try {
      const parsed = JSON.parse(content);
      
      const stringsToRedact = Array.isArray(parsed.strings_to_redact) 
        ? parsed.strings_to_redact.filter((s: any) => typeof s === "string" && s.trim().length > 0)
        : [];
      
      console.log("detectPII:success", {
        elapsed,
        stringsFound: stringsToRedact.length,
        confidence: parsed.confidence,
      });
      
      return {
        strings_to_redact: stringsToRedact,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      };
    } catch (parseError) {
      console.warn("detectPII:parse_failed", { content, error: String(parseError) });
      
      return {
        strings_to_redact: [],
        confidence: 0,
      };
    }
  } catch (error) {
    const errorMsg = String(error);
    console.warn("detectPII:error", { error: errorMsg });
    
    return {
      strings_to_redact: [],
      confidence: 0,
    };
  }
}

