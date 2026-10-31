import { bookVisit } from "@/lib/voice-flow";
import { viewLedger } from "@/lib/ledger";

export const runtime = "nodejs";

const tool = {
  name: "book_service_visit",
  description:
    "Book a home-service visit for the shop and, if asked, open a PayPal sandbox order for the diagnostic deposit. Prices for the deposit come from the price book. This does not send an invoice.",
  inputSchema: {
    type: "object",
    properties: {
      customerName: { type: "string" },
      phone: { type: "string" },
      address: { type: "string" },
      symptom: { type: "string" },
      windowLabel: { type: "string" },
      email: { type: "string" },
      takeDeposit: { type: "boolean" },
      shopId: { type: "string" },
    },
    required: ["customerName", "phone", "address", "symptom", "windowLabel"],
  },
};

export function GET() {
  return Response.json({ tools: [tool] });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };
  const id = body.id ?? null;
  if (body.method === "tools/list") {
    return Response.json({ jsonrpc: "2.0", id, result: { tools: [tool] } });
  }
  if (body.method !== "tools/call" || body.params?.name !== "book_service_visit") {
    return Response.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method or tool not found." } });
  }
  const args = body.params.arguments ?? {};
  const data = await viewLedger();
  const shopId = typeof args.shopId === "string" && data.shops.some((shop) => shop.id === args.shopId) ? args.shopId : data.shops[0]?.id;
  if (!shopId) {
    return Response.json({ jsonrpc: "2.0", id, error: { code: -32000, message: "No shop is on the ledger." } });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || new URL(request.url).origin;
  try {
    const booked = await bookVisit({
      shopId,
      customerName: String(args.customerName ?? ""),
      phone: String(args.phone ?? ""),
      address: String(args.address ?? ""),
      symptom: String(args.symptom ?? ""),
      windowLabel: String(args.windowLabel ?? ""),
      email: typeof args.email === "string" ? args.email : undefined,
      takeDeposit: args.takeDeposit === true,
      origin,
    });
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(booked) }],
        isError: false,
        structuredContent: booked,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking failed.";
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: message }], isError: true },
    });
  }
}
