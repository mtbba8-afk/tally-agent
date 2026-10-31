import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { buildSeed, ensureDemoDispute } from "./seed";
import type { DisputePacket, LedgerData, OwnerMessage, ServiceCall } from "./types";

export const VOICE_EVENT_ID = "tally_voice_state";

const globalStore = globalThis as unknown as {
  __tallyMemory?: LedgerData | null;
  __tallyChain?: Promise<void>;
};

function chain(): Promise<void> {
  globalStore.__tallyChain ??= Promise.resolve();
  return globalStore.__tallyChain;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain().then(task, task);
  globalStore.__tallyChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function readEnv(name: string): string {
  // Bracket access stays dynamic so Next does not inline the value at build time.
  return (process.env[name] ?? "").trim();
}

export function dataFilePath(): string {
  return readEnv("TALLY_DATA_PATH") || path.join(process.cwd(), ".data", "ledger.json");
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

function supabaseUrl(): string {
  return readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function supabaseServiceKey(): string {
  return readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function viewLedger(): Promise<LedgerData> {
  return enqueue(async () => {
    await connection();
    const data = await ensureLoaded();
    return structuredClone(data);
  });
}

export function updateLedger(mutate: (data: LedgerData) => void): Promise<LedgerData> {
  return enqueue(async () => {
    await connection();
    const data = await ensureLoaded();
    mutate(data);
    await persist(data);
    return structuredClone(data);
  });
}

async function ensureLoaded(): Promise<LedgerData> {
  if (!globalStore.__tallyMemory) {
    const loaded = normalizeLedger(await load());
    const added = ensureDemoDispute(loaded);
    globalStore.__tallyMemory = loaded;
    if (added) await persist(loaded);
  }
  return globalStore.__tallyMemory;
}

async function load(): Promise<LedgerData> {
  if (supabaseConfigured()) return loadSupabase();
  return loadFile();
}

async function persist(data: LedgerData): Promise<void> {
  if (supabaseConfigured()) {
    await persistSupabase(data);
    return;
  }
  await persistFile(data);
}

async function loadFile(): Promise<LedgerData> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ dataFilePath(), "utf8");
    return normalizeLedger(JSON.parse(raw) as LedgerData);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    const seed = buildSeed(new Date());
    await persistFile(seed);
    return seed;
  }
}

async function persistFile(data: LedgerData): Promise<void> {
  const file = dataFilePath();
  await mkdir(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(data, null, 2));
  await rename(/* turbopackIgnore: true */ tmp, file);
}

function supabaseAdmin(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) throw new Error("Supabase env is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadSupabase(): Promise<LedgerData> {
  const client = supabaseAdmin();
  const shops = await must(client.from("shops").select("*"));
  if (shops.length === 0) {
    const seed = buildSeed(new Date());
    await persistSupabase(seed);
    return seed;
  }
  const [customers, jobs, invoices, logs, events] = await Promise.all([
    must(client.from("customers").select("*")),
    must(client.from("jobs").select("*")),
    must(client.from("invoices").select("*")),
    must(client.from("agent_log").select("*")),
    must(client.from("paypal_events").select("*")),
  ]);
  const voiceRow = events.find((row) => String(row.id) === VOICE_EVENT_ID);
  const voice = readVoicePayload(voiceRow?.payload);
  return normalizeLedger({
    shops: shops.map(shopFromRow),
    customers: customers.map(customerFromRow),
    jobs: jobs.map(jobFromRow),
    invoices: invoices.map(invoiceFromRow),
    logs: logs.map(logFromRow),
    events: events.filter((row) => String(row.id) !== VOICE_EVENT_ID).map(eventFromRow),
    calls: voice.calls,
    messages: voice.messages,
    disputes: voice.disputes,
  });
}

async function persistSupabase(data: LedgerData): Promise<void> {
  const client = supabaseAdmin();
  await must(client.from("shops").upsert(data.shops.map(shopToRow)));
  await must(client.from("customers").upsert(data.customers.map(customerToRow)));
  await must(client.from("jobs").upsert(data.jobs.map(jobToRow)));
  await must(client.from("invoices").upsert(data.invoices.map(invoiceToRow)));
  if (data.logs.length) await must(client.from("agent_log").upsert(data.logs.map(logToRow)));
  const events = data.events.filter((event) => event.id !== VOICE_EVENT_ID);
  events.push({
    id: VOICE_EVENT_ID,
    receivedAt: new Date().toISOString(),
    eventType: "tally.voice_state",
    payload: {
      calls: data.calls ?? [],
      messages: data.messages ?? [],
      disputes: data.disputes ?? [],
    },
  });
  await must(client.from("paypal_events").upsert(events.map(eventToRow)));
}

export function normalizeLedger(data: LedgerData): LedgerData {
  return {
    ...data,
    calls: Array.isArray(data.calls) ? data.calls : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    disputes: Array.isArray(data.disputes) ? data.disputes : [],
    events: Array.isArray(data.events) ? data.events.filter((event) => event.id !== VOICE_EVENT_ID) : [],
  };
}

function readVoicePayload(payload: unknown): { calls: ServiceCall[]; messages: OwnerMessage[]; disputes: DisputePacket[] } {
  if (!payload || typeof payload !== "object") return { calls: [], messages: [], disputes: [] };
  const record = payload as { calls?: unknown; messages?: unknown; disputes?: unknown };
  return {
    calls: Array.isArray(record.calls) ? (record.calls as ServiceCall[]) : [],
    messages: Array.isArray(record.messages) ? (record.messages as OwnerMessage[]) : [],
    disputes: Array.isArray(record.disputes) ? (record.disputes as DisputePacket[]) : [],
  };
}

async function must<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

type Row = Record<string, unknown>;

function shopToRow(shop: LedgerData["shops"][number]): Row {
  return {
    id: shop.id,
    name: shop.name,
    trade: shop.trade,
    city: shop.city,
    owner_given_name: shop.ownerGivenName,
    owner_surname: shop.ownerSurname,
    email: shop.email,
    auto_send_threshold_cents: shop.autoSendThresholdCents,
    simulated_now: shop.simulatedNow,
  };
}

function shopFromRow(row: Row): LedgerData["shops"][number] {
  return {
    id: String(row.id),
    name: String(row.name),
    trade: row.trade as LedgerData["shops"][number]["trade"],
    city: String(row.city),
    ownerGivenName: String(row.owner_given_name),
    ownerSurname: String(row.owner_surname),
    email: String(row.email),
    autoSendThresholdCents: Number(row.auto_send_threshold_cents),
    simulatedNow: row.simulated_now ? String(row.simulated_now) : null,
  };
}

function customerToRow(customer: LedgerData["customers"][number]): Row {
  return {
    id: customer.id,
    shop_id: customer.shopId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
  };
}

function customerFromRow(row: Row): LedgerData["customers"][number] {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    name: String(row.name),
    email: String(row.email),
    phone: String(row.phone),
  };
}

function jobToRow(job: LedgerData["jobs"][number]): Row {
  return {
    id: job.id,
    shop_id: job.shopId,
    customer_id: job.customerId,
    trade: job.trade,
    notes: job.notes,
    status: job.status,
    completed_at: job.completedAt,
  };
}

function jobFromRow(row: Row): LedgerData["jobs"][number] {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    customerId: String(row.customer_id),
    trade: row.trade as LedgerData["jobs"][number]["trade"],
    notes: String(row.notes),
    status: row.status as LedgerData["jobs"][number]["status"],
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function invoiceToRow(invoice: LedgerData["invoices"][number]): Row {
  return {
    id: invoice.id,
    shop_id: invoice.shopId,
    job_id: invoice.jobId,
    customer_id: invoice.customerId,
    number: invoice.number,
    status: invoice.status,
    lines: invoice.lines,
    subtotal_cents: invoice.subtotalCents,
    paid_cents: invoice.paidCents,
    confidence: invoice.confidence,
    note: invoice.note,
    customer_note: invoice.customerNote,
    send_error: invoice.sendError,
    paypal_invoice_id: invoice.paypalInvoiceId,
    paypal_order_id: invoice.paypalOrderId,
    pay_url: invoice.payUrl,
    gateway_mode: invoice.gatewayMode,
    sent_at: invoice.sentAt,
    paid_at: invoice.paidAt,
    reminders_sent: invoice.remindersSent,
  };
}

function invoiceFromRow(row: Row): LedgerData["invoices"][number] {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    jobId: String(row.job_id),
    customerId: String(row.customer_id),
    number: String(row.number),
    status: row.status as LedgerData["invoices"][number]["status"],
    lines: (row.lines as LedgerData["invoices"][number]["lines"]) ?? [],
    subtotalCents: Number(row.subtotal_cents),
    paidCents: Number(row.paid_cents ?? 0),
    confidence: row.confidence as LedgerData["invoices"][number]["confidence"],
    note: String(row.note ?? ""),
    customerNote: String(row.customer_note ?? ""),
    sendError: row.send_error ? String(row.send_error) : null,
    paypalInvoiceId: row.paypal_invoice_id ? String(row.paypal_invoice_id) : null,
    paypalOrderId: row.paypal_order_id ? String(row.paypal_order_id) : null,
    payUrl: row.pay_url ? String(row.pay_url) : null,
    gatewayMode: row.gateway_mode === "sandbox" ? "sandbox" : "mock",
    sentAt: row.sent_at ? String(row.sent_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    remindersSent: Array.isArray(row.reminders_sent) ? (row.reminders_sent as LedgerData["invoices"][number]["remindersSent"]) : [],
  };
}

function logToRow(entry: LedgerData["logs"][number]): Row {
  return {
    id: entry.id,
    shop_id: entry.shopId,
    at: entry.at,
    actor: entry.actor,
    action: entry.action,
    detail: entry.detail,
    invoice_id: entry.invoiceId,
    job_id: entry.jobId,
  };
}

function logFromRow(row: Row): LedgerData["logs"][number] {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    at: String(row.at),
    actor: row.actor as LedgerData["logs"][number]["actor"],
    action: String(row.action),
    detail: String(row.detail),
    invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    jobId: row.job_id ? String(row.job_id) : null,
  };
}

function eventToRow(event: LedgerData["events"][number]): Row {
  return {
    id: event.id,
    received_at: event.receivedAt,
    event_type: event.eventType,
    payload: event.payload,
  };
}

function eventFromRow(row: Row): LedgerData["events"][number] {
  return {
    id: String(row.id),
    receivedAt: String(row.received_at),
    eventType: String(row.event_type),
    payload: row.payload,
  };
}
