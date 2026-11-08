import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  slug: text("slug").primaryKey(),
  productName: text("product_name").notNull(),
  providerName: text("provider_name").notNull(),
  productUrl: text("product_url"),
  logo: text("logo"),
  toolkitSlug: text("toolkit_slug"),
  composioManaged: boolean("composio_managed"),
  inLibrary: boolean("in_library").notNull().default(false),
  popularity: integer("popularity"),
});

export const guideVersions = pgTable("guide_versions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().references(() => products.slug),
  version: integer("version").notNull(),
  origin: text("origin", { enum: ["curated", "live"] }).notNull(),
  reviewStatus: text("review_status", { enum: ["reviewed", "unreviewed"] }).notNull(),
  level: integer("level"),
  levelCeiling: integer("level_ceiling"),
  confidence: text("confidence"),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  query: text("query").notNull(),
  slug: text("slug"),
  status: text("status", { enum: ["queued", "running", "done", "error"] }).notNull().default("queued"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  costUsd: numeric("cost_usd"),
  durationSec: integer("duration_sec"),
});

export const jobEvents = pgTable("job_events", {
  id: serial("id").primaryKey(),
  jobId: uuid("job_id").notNull().references(() => jobs.id),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
});
