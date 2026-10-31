import { SandboxPayPalGateway } from "@tounkara/payment-links";
import type { PayPalWebhookEvent } from "@tounkara/reconciliation";
import { applyPayPalEvent } from "@/lib/collect";
import { createPayPalGateway, paypalConfigured } from "@/lib/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(raw) as PayPalWebhookEvent;
  } catch {
    return Response.json({ error: "Expected a JSON webhook." }, { status: 400 });
  }
  if (!event?.id || !event.event_type || !event.resource) {
    return Response.json({ error: "Webhook is missing id, event_type, or resource." }, { status: 400 });
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (paypalConfigured()) {
    if (!webhookId) {
      return Response.json(
        { error: "Set PAYPAL_WEBHOOK_ID before accepting PayPal webhooks. Check PayPal for payment still reconciles a sandbox invoice." },
        { status: 400 },
      );
    }
    const gateway = createPayPalGateway();
    if (gateway instanceof SandboxPayPalGateway) {
      const verified = await gateway.verifyWebhook({
        webhookId,
        transmissionId: request.headers.get("paypal-transmission-id") ?? "",
        transmissionTime: request.headers.get("paypal-transmission-time") ?? "",
        transmissionSig: request.headers.get("paypal-transmission-sig") ?? "",
        certUrl: request.headers.get("paypal-cert-url") ?? "",
        authAlgo: request.headers.get("paypal-auth-algo") ?? "",
        event,
      });
      if (!verified) return Response.json({ error: "PayPal signature was not verified." }, { status: 400 });
    }
  }

  const result = await applyPayPalEvent(event);
  return Response.json({ ok: true, result });
}
