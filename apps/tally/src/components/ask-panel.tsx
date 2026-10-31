"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const prompts = ["Who still owes me?", "Who should I call today?", "What was paid this month?"];

export function AskPanel({ aiEnabled }: { aiEnabled: boolean }) {
  return aiEnabled ? <ModelChat /> : <PriceBookChat />;
}

function ModelChat() {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [text, setText] = useState("");
  const busy = status === "submitted" || status === "streaming";

  return (
    <ChatFrame
      messages={messages.map((message) => ({ id: message.id, role: message.role, text: textOf(message) }))}
      error={error?.message}
      busy={busy}
      text={text}
      setText={setText}
      onSend={async (value) => {
        setText("");
        await sendMessage({ text: value });
      }}
    />
  );
}

function PriceBookChat() {
  const [messages, setMessages] = useState<Array<{ id: string; role: string; text: string }>>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <ChatFrame
      messages={messages}
      error={error}
      busy={busy}
      text={text}
      setText={setText}
      onSend={async (value) => {
        setText("");
        setBusy(true);
        setError(undefined);
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: value }]);
        try {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: value }),
          });
          const body = (await response.json()) as { answer?: string; error?: string };
          if (!response.ok || !body.answer) {
            setError(body.error ?? "The books did not answer.");
            return;
          }
          setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: body.answer ?? "" }]);
        } catch {
          setError("The books did not answer.");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function ChatFrame({
  messages,
  error,
  busy,
  text,
  setText,
  onSend,
}: {
  messages: Array<{ id: string; role: string; text: string }>;
  error?: string;
  busy: boolean;
  text: string;
  setText: (value: string) => void;
  onSend: (value: string) => Promise<void>;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-full border border-line bg-card px-3 py-1.5 text-xs"
            onClick={() => void onSend(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="mt-4 min-h-48 space-y-3">
        {messages.length === 0 ? <p className="text-sm text-muted">Ask about open balances, payments, or reminders.</p> : null}
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
            <p className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "bg-accent text-[var(--accent-foreground)]" : "bg-card border border-line"}`}>
              {message.text || (busy ? "Looking..." : "")}
            </p>
          </div>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = text.trim();
          if (!value || busy) return;
          void onSend(value);
        }}
      >
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Who still owes me?" />
        <Button type="submit" disabled={busy}>
          {busy ? "Asking..." : "Ask"}
        </Button>
      </form>
    </div>
  );
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("");
}
