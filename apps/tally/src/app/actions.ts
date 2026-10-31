"use server";

import { EmptyJobNoteError } from "@tounkara/invoice-drafting";
import { moneyValue } from "@tounkara/payment-links";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { decisionFor, draftFromNotes } from "@/lib/agent";
import {
  allocateNumber,
  applyPayPalEvent,
  deliverInvoice,
  freshId,
  refreshPayPalStatus,
  reprice,
  runReminders,
} from "@/lib/collect";
import { updateLedger, viewLedger } from "@/lib/ledger";
import { balanceCents, currentShopId } from "@/lib/runtime";
import type { Invoice } from "@/lib/types";

export type ActionState = { error: string } | null;

function rethrowRedirect(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

async function origin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3847";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function setShop(formData: FormData): Promise<void> {
  const shopId = String(formData.get("shopId") ?? "");
  const data = await viewLedger();
  if (!data.shops.some((shop) => shop.id === shopId)) return;
  const jar = await cookies();
  jar.set("tally_shop", shopId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/");
}

export async function createFinishedJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const notes = String(formData.get("notes") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  try {
    const data = await viewLedger();
    const shopId = await currentShopId(data);
    const shop = data.shops.find((item) => item.id === shopId);
    const customer = data.customers.find((item) => item.id === customerId && item.shopId === shopId);
    if (!shop || !customer) return { error: "Pick a customer on this shop." };

    const drafted = await draftFromNotes({
      note: notes,
      trade: shop.trade,
      customerName: customer.name,
    });
    const decision = decisionFor(drafted.draft, shop);
    const invoiceId = freshId("inv");
    const jobId = freshId("job");

    await updateLedger((ledger) => {
      ledger.jobs.push({
        id: jobId,
        shopId: shop.id,
        customerId: customer.id,
        trade: shop.trade,
        notes: drafted.draft.jobNote,
        status: "done",
        completedAt: new Date().toISOString(),
      });
      const invoice: Invoice = {
        id: invoiceId,
        shopId: shop.id,
        jobId,
        customerId: customer.id,
        number: allocateNumber(ledger),
        status: "awaiting_approval",
        lines: drafted.draft.lines,
        subtotalCents: drafted.draft.subtotalCents,
        paidCents: 0,
        confidence: drafted.draft.confidence,
        note: drafted.draft.jobNote,
        customerNote: drafted.customerNote,
        sendError: null,
        paypalInvoiceId: null,
        paypalOrderId: null,
        payUrl: null,
        gatewayMode: "mock",
        sentAt: null,
        paidAt: null,
        remindersSent: [],
      };
      ledger.invoices.push(invoice);
      ledger.logs.push({
        id: freshId("log"),
        shopId: shop.id,
        at: new Date().toISOString(),
        actor: "agent",
        action: "draft_created",
        detail: decision.required
          ? `Drafted ${invoice.number} from the job note (${drafted.source === "model" ? "model" : "price book"}). ${decision.reason}`
          : `Drafted ${invoice.number} under the auto-send threshold. Sending it now.`,
        invoiceId: invoice.id,
        jobId,
      });
    });

    if (!decision.required) {
      await deliverInvoice(invoiceId, await origin());
    }
    redirect(`/invoices/${invoiceId}`);
  } catch (error) {
    rethrowRedirect(error);
    if (error instanceof EmptyJobNoteError) return { error: error.message };
    return { error: "Could not draft that invoice." };
  }
}

export async function approveAndSend(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const quantities: Record<string, number> = {};
  const pricesCents: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("qty_")) quantities[key.slice(4)] = Number(value);
    if (key.startsWith("dollars_")) pricesCents[key.slice("dollars_".length)] = Math.round(Number(value) * 100);
  }
  const data = await viewLedger();
  const existing = data.invoices.find((invoice) => invoice.id === invoiceId);
  if (!existing) redirect("/invoices");
  if (existing.status === "awaiting_approval" || existing.status === "draft") {
    const lines = reprice(existing.lines, quantities, pricesCents);
    const unpriced = lines.some((line) => line.code.startsWith("review.unmatched") && line.amountCents <= 0);
    if (lines.length === 0 || lines.every((line) => line.amountCents <= 0) || unpriced) {
      await updateLedger((ledger) => {
        const row = ledger.invoices.find((invoice) => invoice.id === invoiceId);
        if (row) {
          row.lines = lines.length > 0 ? lines : row.lines;
          row.subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
          row.sendError = unpriced
            ? "Price each line the book did not recognize before sending."
            : "Add a price before sending.";
        }
      });
      redirect(`/invoices/${invoiceId}`);
    }
    await updateLedger((ledger) => {
      const row = ledger.invoices.find((invoice) => invoice.id === invoiceId);
      if (!row) return;
      row.lines = lines;
      row.subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
      row.sendError = null;
    });
  }
  await deliverInvoice(invoiceId, await origin());
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}`);
}

export async function voidInvoice(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await updateLedger((ledger) => {
    const row = ledger.invoices.find((invoice) => invoice.id === invoiceId);
    if (!row) return;
    if (row.status !== "awaiting_approval" && row.status !== "draft") return;
    row.status = "void";
    ledger.logs.push({
      id: freshId("log"),
      shopId: row.shopId,
      at: new Date().toISOString(),
      actor: "owner",
      action: "invoice_voided",
      detail: `Voided ${row.number} before it was sent.`,
      invoiceId: row.id,
      jobId: row.jobId,
    });
  });
  redirect(`/invoices/${invoiceId}`);
}

export async function chaseNow(): Promise<void> {
  await runReminders(await origin());
  revalidatePath("/");
  revalidatePath("/activity");
}

export async function setDemoClock(formData: FormData): Promise<void> {
  const shopId = String(formData.get("shopId") ?? "");
  const mode = String(formData.get("mode") ?? "reset");
  const anchor = String(formData.get("anchor") ?? "");
  await updateLedger((ledger) => {
    const shop = ledger.shops.find((item) => item.id === shopId);
    if (!shop) return;
    if (mode === "reset") {
      shop.simulatedNow = null;
      return;
    }
    const base = anchor ? new Date(anchor) : new Date();
    const extraDays = mode === "day3" ? 3 : mode === "day7" ? 7 : mode === "day14" ? 14 : 0;
    shop.simulatedNow = new Date(base.getTime() + extraDays * 86_400_000 + 60 * 60 * 1000).toISOString();
  });
  revalidatePath("/");
}

export async function markBuyerView(invoiceId: string): Promise<void> {
  const data = await viewLedger();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice || invoice.status !== "sent") return;
  await applyPayPalEvent({
    id: `WH-VIEW-${invoice.id}`,
    event_type: "INVOICING.INVOICE.UPDATED",
    resource: {
      id: invoice.paypalInvoiceId ?? invoice.id,
      status: "VIEWED",
      invoice_number: invoice.number,
    },
  });
}

export async function payAsBuyer(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const portion = String(formData.get("portion") ?? "full");
  const data = await viewLedger();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) redirect("/");
  if (invoice.status === "paid" || invoice.status === "void" || invoice.status === "disputed") {
    redirect(`/pay/${invoiceId}`);
  }
  if (invoice.gatewayMode === "sandbox" && invoice.payUrl?.startsWith("http")) {
    redirect(invoice.payUrl);
  }
  const due = balanceCents(invoice);
  const slice = portion === "half" ? Math.max(1, Math.round(due / 2)) : due;
  const cumulative = Math.min(invoice.subtotalCents, invoice.paidCents + slice);
  const full = cumulative >= invoice.subtotalCents;
  await applyPayPalEvent({
    id: `WH-LOCAL-${invoice.id}-${cumulative}-${Date.now()}`,
    event_type: full ? "INVOICING.INVOICE.PAID" : "INVOICING.INVOICE.UPDATED",
    resource: full
      ? {
          id: invoice.paypalInvoiceId ?? invoice.id,
          status: "PAID",
          invoice_number: invoice.number,
          amount: { currency_code: "USD", value: moneyValue(invoice.subtotalCents) },
        }
      : {
          id: invoice.paypalInvoiceId ?? invoice.id,
          status: "PARTIALLY_PAID",
          invoice_number: invoice.number,
          amount: { currency_code: "USD", value: moneyValue(invoice.subtotalCents) },
          payments: { paid_amount: { currency_code: "USD", value: moneyValue(cumulative) } },
        },
  });
  redirect(`/pay/${invoiceId}`);
}

export async function checkPayPal(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await refreshPayPalStatus(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/pay/${invoiceId}`);
}

