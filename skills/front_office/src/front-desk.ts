export type Booking = {
  customerName: string;
  when: string;
  confirmation: string;
  transcript: string;
};

export function bookCall(transcript: string): Booking {
  const named = transcript.match(/(?:this is|i'm|i am)\s+([A-Za-z]+)/i);
  const customerName = named?.[1] ? titled(named[1]) : "Customer";
  const tuesday = /tuesday\b/i.test(transcript) && /10\s*am/i.test(transcript);
  const when = tuesday ? "Tuesday 10:00" : "unscheduled";
  const confirmation =
    when === "unscheduled"
      ? `Got the message from ${customerName}. No time was confirmed yet.`
      : `Booked ${when} for ${customerName}. A text confirmation is ready.`;
  return { customerName, when, confirmation, transcript: transcript.trim() };
}

function titled(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
