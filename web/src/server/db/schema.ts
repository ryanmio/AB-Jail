import {
  pgTable,
  uuid,
  timestamp,
  text,
  numeric,
  jsonb,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    uploaderFingerprint: text("uploader_fingerprint"),
    imageUrl: text("image_url").notNull(),
    messageType: text("message_type").default("unknown"), // enum in SQL
    rawText: text("raw_text"),
    senderId: text("sender_id"),
    senderName: text("sender_name"),
    isFundraising: boolean("is_fundraising"),
    links: jsonb("links").$type<Array<{ url: string; domain?: string }>>().default([]),
    mediaUrls: jsonb("media_urls").$type<Array<{ url: string; contentType?: string }>>().default([]),
    redactLevel: text("redact_level").default("default"), // enum in SQL
    aiVersion: text("ai_version"),
    aiConfidence: numeric("ai_confidence", { precision: 3, scale: 2 }),
    aiSummary: text("ai_summary"),
    emailSubject: text("email_subject"),
    emailBody: text("email_body"),
    emailBodyOriginal: text("email_body_original"),
    emailFrom: text("email_from"),
    isPublic: boolean("public").default(true),
    landingUrl: text("landing_url"),
    landingScreenshotUrl: text("landing_screenshot_url"),
    landingRenderedAt: timestamp("landing_rendered_at", { withTimezone: true }),
    landingRenderStatus: text("landing_render_status"),
    forwarderEmail: text("forwarder_email"),
    submissionToken: text("submission_token"),
    tokenUsedAt: timestamp("token_used_at", { withTimezone: true }),
    previewEmailSentAt: timestamp("preview_email_sent_at", { withTimezone: true }),
    previewEmailStatus: text("preview_email_status"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  },
  (table) => {
    return {
      senderIdx: index("submissions_sender_idx").on(table.senderId),
      createdIdx: index("submissions_created_idx").on(table.createdAt),
    };
  }
);

export const violations = pgTable("violations", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidenceSpans: jsonb("evidence_spans").$type<
    Array<{ text: string; start: number; end: number }>
  >(),
  severity: integer("severity").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  actblueVerified: boolean("actblue_verified").default(false),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  submissionId: uuid("submission_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const deletionRequests = pgTable(
  "deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").notNull(),
    reason: text("reason").notNull(),
    requester: text("requester"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => {
    return {
      submissionIdx: index("deletion_requests_submission_idx").on(table.submissionId),
    };
  }
);

export const evaluationSessions = pgTable(
  "evaluation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: text("device_id").notNull(),
    ipAddress: text("ip_address"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    totalEvaluations: integer("total_evaluations").default(0),
    isComplete: boolean("is_complete").default(false),
  },
  (table) => {
    return {
      deviceIdx: index("evaluation_sessions_device_idx").on(table.deviceId),
      completedIdx: index("evaluation_sessions_completed_idx").on(table.completedAt),
    };
  }
);

export const evaluationResponses = pgTable(
  "evaluation_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    submissionId: uuid("submission_id").notNull(),
    manualViolations: jsonb("manual_violations").$type<string[]>().default([]),
    evaluatorNotes: text("evaluator_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    aiViolations: jsonb("ai_violations").$type<string[]>().default([]),
  },
  (table) => {
    return {
      sessionIdx: index("evaluation_responses_session_idx").on(table.sessionId),
      submissionIdx: index("evaluation_responses_submission_idx").on(table.submissionId),
      createdIdx: index("evaluation_responses_created_idx").on(table.createdAt),
    };
  }
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").notNull(),
    toEmail: text("to_email").notNull(),
    ccEmail: text("cc_email"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    htmlBody: text("html_body"), // HTML version for re-sending queued reports
    screenshotUrl: text("screenshot_url"),
    landingUrl: text("landing_url").notNull(),
    status: text("status").notNull(), // enum in SQL: sent, failed, responded, queued
    sendToken: text("send_token"), // secure token for manual sending of queued reports
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => {
    return {
      caseIdx: index("reports_case_idx").on(table.caseId),
    };
  }
);

export const reportVerdicts = pgTable(
  "report_verdicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").notNull(),
    verdict: text("verdict").notNull(), // violation_confirmed, no_violation, pending, under_review, resolved
    explanation: text("explanation"),
    determinedBy: text("determined_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => {
    return {
      caseIdx: index("report_verdicts_case_idx").on(table.caseId),
    };
  }
);

export const senderViolationExemptions = pgTable(
  "sender_violation_exemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderPattern: text("sender_pattern").notNull(),
    violationCode: text("violation_code").notNull(),
    reason: text("reason"),
    verifiedBy: text("verified_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => {
    return {
      codeIdx: index("sender_violation_exemptions_code_idx").on(table.violationCode),
    };
  }
);

