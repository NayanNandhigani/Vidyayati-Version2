import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/chatbot/knowledge";

// Public homepage chatbot. Answers questions about the product only, from
// the fixed facts in lib/chatbot/knowledge.ts. It has no tools and no
// database access, so it cannot reveal any school's data.
//
// Needs ANTHROPIC_API_KEY set on the server. Without it the endpoint
// returns 503 and the widget shows a "chat unavailable" message.

export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 20; // messages kept from the conversation (user + assistant)
const MAX_MESSAGE_CHARS = 1000;
const MAX_REPLY_TOKENS = 1024;

// Per-IP limit so one visitor can't run up the bill. This lives in memory,
// so it resets on redeploy and isn't shared between instances; that's
// acceptable for a single Railway instance, but move it to the database or
// Redis if the app is ever scaled out.
const RATE_LIMIT = 20; // messages
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map from growing without bound on a long-running instance.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

function parseMessages(body: unknown): ChatTurn[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) return null;
  const raw = (body as { messages: unknown[] }).messages;
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim();
    if (!text) continue;
    turns.push({ role, content: text.slice(0, MAX_MESSAGE_CHARS) });
  }
  const recent = turns.slice(-MAX_TURNS);
  // The API needs the conversation to start with a user turn and end with one.
  while (recent.length && recent[0]!.role !== "user") recent.shift();
  if (!recent.length || recent[recent.length - 1]!.role !== "user") return null;
  return recent;
}

function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

let client: Anthropic | null = null;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return textResponse("Chat isn't available right now.", 503);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return textResponse("You've sent a lot of messages. Please wait a few minutes and try again.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return textResponse("Invalid request.", 400);
  }
  const messages = parseMessages(body);
  if (!messages) return textResponse("Invalid request.", 400);

  client ??= new Anthropic();

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: MAX_REPLY_TOKENS,
    // Short product Q&A doesn't need deep reasoning; low effort keeps
    // replies fast and cheap.
    output_config: { effort: "low" },
    // If the model declines a request, the API retries it on Anthropic's
    // recommended fallback model instead of returning a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wroteText = false;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            wroteText = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !wroteText) {
          controller.enqueue(encoder.encode("Sorry, I can't help with that. I can answer questions about Vidya Yati and its modules."));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("…"));
        }
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
          console.error("[chat] Anthropic rate limit", error.message);
        } else if (error instanceof Anthropic.APIError) {
          console.error(`[chat] Anthropic API error ${error.status}`, error.message);
        } else {
          console.error("[chat] unexpected error", error);
        }
        controller.enqueue(encoder.encode(wroteText ? "\n\n(The reply was cut off. Please try again.)" : "Sorry, something went wrong. Please try again in a moment."));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body$, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
