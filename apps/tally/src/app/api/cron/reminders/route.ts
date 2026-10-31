import { runReminders, writeWeeklyDigest } from "@/lib/collect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.VERCEL === "1") {
    return Response.json({ error: "Set CRON_SECRET before this route is public." }, { status: 401 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://127.0.0.1:3847";
  const reminders = await runReminders(origin);
  await writeWeeklyDigest();
  return Response.json({ ok: true, ...reminders });
}
