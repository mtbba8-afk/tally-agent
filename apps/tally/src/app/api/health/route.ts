import { runtimeMode } from "@/lib/runtime";

export const runtime = "nodejs";

export function GET() {
  const mode = runtimeMode();
  return Response.json({
    ok: true,
    paypal: mode.paypal,
    ai: mode.ai,
    store: mode.store,
    model: process.env.AI_MODEL?.trim() || "openai/gpt-5.4-mini",
  });
}
