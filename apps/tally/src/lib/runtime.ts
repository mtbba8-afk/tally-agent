import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import {
  MockPayPalGateway,
  SandboxPayPalGateway,
  paypalToolkitActions,
  type PayPalGateway,
} from "@tounkara/payment-links";
import { cookies } from "next/headers";
import { supabaseConfigured, viewLedger } from "./ledger";
import type { LedgerData, RuntimeMode, Shop } from "./types";

const mockGateway = new MockPayPalGateway();

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim());
}

export function aiEnabled(): boolean {
  if (process.env.TALLY_DISABLE_AI === "1") return false;
  if (process.env.AI_GATEWAY_API_KEY?.trim()) return true;
  return process.env.VERCEL === "1";
}

export function modelId(): string {
  return process.env.AI_MODEL?.trim() || "openai/gpt-5.4-mini";
}

export function runtimeMode(): RuntimeMode {
  return {
    paypal: paypalConfigured() ? "sandbox" : "mock",
    ai: aiEnabled() ? "gateway" : "price_book",
    store: supabaseConfigured() ? "supabase" : "file",
  };
}

export function createPayPalGateway(): PayPalGateway {
  if (!paypalConfigured()) return mockGateway;
  return new SandboxPayPalGateway({
    clientId: process.env.PAYPAL_CLIENT_ID!.trim(),
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!.trim(),
  });
}

export function createPayPalToolkit(): PayPalAgentToolkit | null {
  if (!paypalConfigured()) return null;
  return new PayPalAgentToolkit({
    clientId: process.env.PAYPAL_CLIENT_ID!.trim(),
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!.trim(),
    configuration: {
      actions: paypalToolkitActions(),
      context: { sandbox: true },
    },
  });
}

export async function currentShopId(data?: LedgerData): Promise<string> {
  const ledger = data ?? (await viewLedger());
  const jar = await cookies();
  const picked = jar.get("tally_shop")?.value;
  if (picked && ledger.shops.some((shop) => shop.id === picked)) return picked;
  return ledger.shops[0]?.id ?? "";
}

export function shopNow(shop: Shop | undefined, realNow = new Date()): Date {
  if (shop?.simulatedNow) return new Date(shop.simulatedNow);
  return realNow;
}

export function splitName(name: string): { givenName: string; surname: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    givenName: parts[0] ?? "Customer",
    surname: parts.slice(1).join(" ") || "Customer",
  };
}

export function balanceCents(invoice: { subtotalCents: number; paidCents: number }): number {
  return Math.max(invoice.subtotalCents - invoice.paidCents, 0);
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(iso));
}

export function customerName(data: LedgerData, customerId: string): string {
  return data.customers.find((customer) => customer.id === customerId)?.name ?? "Customer";
}

export function nextInvoiceNumber(data: LedgerData): string {
  const nums = data.invoices
    .map((invoice) => Number(invoice.number.replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value));
  const next = Math.max(1000, ...nums) + 1;
  return `INV-${next}`;
}

export function nid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
