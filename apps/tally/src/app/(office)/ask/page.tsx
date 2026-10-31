import { AskPanel } from "@/components/ask-panel";
import { aiEnabled } from "@/lib/runtime";

export default function AskPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl tracking-tight">Ask the books</h1>
      <p className="mt-2 text-sm text-muted">
        {aiEnabled()
          ? "The model answers from the ledger, and from PayPal when sandbox keys are set."
          : "Without a model key, Tally answers who owes you, what was paid, and which invoices are past day 7."}
      </p>
      <div className="mt-6">
        <AskPanel aiEnabled={aiEnabled()} />
      </div>
    </div>
  );
}
