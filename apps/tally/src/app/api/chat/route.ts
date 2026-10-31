import { convertToModelMessages, type UIMessage } from "ai";
import { answerFromBooks, askBooks } from "@/lib/agent";
import { viewLedger } from "@/lib/ledger";
import { aiEnabled, currentShopId, shopNow } from "@/lib/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { question?: string; messages?: UIMessage[] };
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const shop = data.shops.find((item) => item.id === shopId);

  if (!aiEnabled() || typeof body.question === "string") {
    const question =
      body.question ??
      [...(body.messages ?? [])]
        .reverse()
        .find((message) => message.role === "user")
        ?.parts.filter((part) => part.type === "text")
        .map((part) => ("text" in part ? part.text : ""))
        .join(" ") ??
      "";
    if (!question.trim()) return Response.json({ error: "Ask a question." }, { status: 400 });
    return Response.json({
      answer: answerFromBooks(question, data, shopId, shopNow(shop)),
      mode: "price_book",
    });
  }

  try {
    const messages = await convertToModelMessages(body.messages ?? []);
    const result = await askBooks(messages, shopId);
    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model did not answer.";
    return Response.json({ error: message }, { status: 502 });
  }
}
