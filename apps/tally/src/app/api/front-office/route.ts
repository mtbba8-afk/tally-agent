import { initialSession, reduceSession, runScriptedDemo, type Session, type SessionAction } from "@tounkara/front-office";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const file = path.join(process.cwd(), ".data", "front-office.json");

function load() {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Session;
  } catch {
    return initialSession(process.env);
  }
}

function save(session: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(session, null, 2));
}

export async function GET() {
  return Response.json(load());
}

export async function POST(request: Request) {
  const body = (await request.json()) as SessionAction | { action: "demo" | "reset" };
  const env = process.env;
  const next =
    body.action === "demo" || body.action === "reset"
      ? body.action === "demo"
        ? await runScriptedDemo({ env })
        : initialSession(env)
      : await reduceSession(load(), body, { now: () => new Date().toISOString(), env });
  save(next);
  return Response.json(next);
}
