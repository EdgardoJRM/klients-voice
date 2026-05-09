#!/usr/bin/env node
/**
 * Dev-only DynamoDB seed using AWS credential chain (e.g. AWS_PROFILE).
 * Set TABLE_* env vars to match deployed stack outputs.
 *
 * Usage:
 *   TABLE_TENANTS=... TABLE_EVENTS=... node scripts/seed/seed-sample.mjs
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const tenantId = process.env.SEED_TENANT_ID || randomUUID();
const eventId = process.env.SEED_EVENT_ID || randomUUID();
const now = new Date().toISOString();

const tenant = {
  tenant_id: tenantId,
  tenant_slug: process.env.SEED_TENANT_SLUG || "demo-tenant",
  tenant_name: "Demo Tenant",
  business_name: "Demo Business",
  contact_email: "hello@demo.com",
  status: "active",
  plan: "pro",
  branding: {},
  default_language: "es",
  timezone: "America/Puerto_Rico",
  created_at: now,
  updated_at: now,
};

const event = {
  event_id: eventId,
  tenant_id: tenantId,
  tenant_date_sk: `${"2026-06-01"}#${eventId}`,
  event_type: "webinar",
  title: "Webinar Seed",
  date: "2026-06-01",
  start_time: "18:00",
  timezone: "America/Puerto_Rico",
  webinar_platform: "zoom",
  webinar_url: "https://example.com/webinar",
  status: "active",
  call_campaign_status: "not_started",
  confirmation_call_enabled: true,
  reminder_call_enabled: false,
  followup_call_enabled: false,
  max_call_retries: 3,
  qr_enabled: false,
  created_at: now,
  updated_at: now,
};

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function put() {
  const tTenants = process.env.TABLE_TENANTS;
  const tEvents = process.env.TABLE_EVENTS;
  if (!tTenants || !tEvents) {
    console.error("Set TABLE_TENANTS and TABLE_EVENTS");
    process.exit(1);
  }
  await client.send(new PutCommand({ TableName: tTenants, Item: tenant }));
  await client.send(new PutCommand({ TableName: tEvents, Item: event }));
  console.log(JSON.stringify({ tenantId, eventId }, null, 2));
}

put().catch((e) => {
  console.error(e);
  process.exit(1);
});
