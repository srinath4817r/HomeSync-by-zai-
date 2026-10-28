import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import type { ProposedAction } from "@/lib/homesync/types";
import { db } from "@/lib/db";
import { isGuardFailure, requireUser } from "@/lib/homesync/auth";
import { rateLimit } from "@/lib/homesync/rate-limit";

export const dynamic = "force-dynamic";

type AssistantRow = {
  id: string;
  role: string;
  content: string;
  action: string | null;
  actionStatus: string | null;
  createdAt: Date;
};

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

const VALID_KINDS = new Set(["add_task", "add_grocery", "add_event", "add_bill", "none"]);

/** Parse the stored `action` column — a JSON object (legacy) or JSON array (batch). */
function parseActions(raw: string | null): ProposedAction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(
      (a): a is ProposedAction =>
        Boolean(a) &&
        typeof a === "object" &&
        typeof (a as { kind?: unknown }).kind === "string" &&
        VALID_KINDS.has((a as { kind: string }).kind)
    );
  } catch {
    return [];
  }
}

function serializeRow(row: AssistantRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    actions: parseActions(row.action),
    actionStatus: row.actionStatus,
    createdAt: row.createdAt,
  };
}

/** Parse "H:MM AM/PM" (e.g. "8:00 AM") into 24h hours/minutes. */
function parseTimeLabel(label: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(label.trim());
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ap = match[3].toUpperCase();
  if (h < 1 || h > 12 || m > 59) return null;
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return { h, m };
}

/** Parse "YYYY-MM-DD" into a local Date. */
function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Compact household context handed to the LLM — REAL data from the caller's family only. */
async function buildContext(familyId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const [members, events, tasks, bills, groceries] = await Promise.all([
    db.member.findMany({ where: { familyId }, orderBy: { createdAt: "asc" } }),
    db.event.findMany({ where: { familyId, startAt: { gte: start, lt: end } }, orderBy: { startAt: "asc" } }),
    db.task.findMany({ where: { familyId, status: { not: "done" } }, orderBy: { dueAt: "asc" } }),
    db.bill.findMany({ where: { familyId, status: "due" }, orderBy: { dueDate: "asc" } }),
    db.groceryItem.findMany({ where: { familyId, status: "needed" }, orderBy: { createdAt: "asc" } }),
  ]);

  const now = Date.now();
  return {
    members: members.map((m) => ({
      name: m.name,
      relation: m.relation,
      role: m.role,
      location: m.locationSharing
        ? m.placeLabel
          ? m.placeLabel
          : "sharing on — live position on the family map"
        : "location sharing off",
    })),
    todayEvents: events.map((e) => `${e.title} at ${fmt(e.startAt)}${e.location ? ` (${e.location})` : ""}`),
    pendingTasks: tasks.map((t) => `${t.title}${t.assigneeId ? "" : ""}`),
    billsDue: bills.map(
      (b) =>
        `${b.title}: ${b.amount} ${b.currency}, due ${b.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    ),
    groceriesNeeded: groceries.map((g) => g.name),
  };
}

function buildSystemPrompt(context: Awaited<ReturnType<typeof buildContext>>): string {
  return (
    "You are HOME SYNC AI — the built-in assistant of the HOME SYNC family app for the household 'Our Home'. " +
    "You run on the GLM model by Z.ai. If the user asks which model or LLM powers you, answer exactly that: " +
    "you are HOME SYNC AI, running on GLM by Z.ai. Never claim to be ChatGPT, Gemini, Siri or any other product. " +
    "Today's date/time: " +
    new Date().toString() +
    ". You help manage tasks, groceries, events and bill reminders. " +
    "ANSWERING RULES: " +
    "1) Reply in at most 3 short friendly sentences. Never use emojis. " +
    "2) Answer questions directly from the context below — never say you don't have context, it is always provided. " +
    "3) If asked for the shopping/buy/grocery list, list the items from groceriesNeeded as a comma-separated list. " +
    "4) If asked where a family member is (e.g. 'where is my dad', 'where is Ramesh'), resolve the relation " +
    "('dad', 'mom', 'son', etc.) or the name against members and answer with their location and how long ago it updated. " +
    "5) If asked for the schedule, list todayEvents; for bills list billsDue. " +
    "6) If the user asks a general question (who are you, which model), answer briefly and naturally. " +
    "CREATION RULE: If the user asks to CREATE one or many things (add task(s) / add grocery item(s) / create event / add bill), " +
    "your visible reply must be a short confirmation of what you will create, and your reply MUST end with a final line " +
    "'ACTIONS:' followed by a compact JSON ARRAY with ONE OBJECT PER ITEM — include EVERY item the user listed " +
    "(example: 'add biscuits, gooday and allout to groceries' -> 3 add_grocery objects). " +
    "Supported kinds: " +
    "{kind:'add_task',title,assigneeName?,time?('HH:MM AM/PM'),recurring?('daily'|'weekly'|'weekdays')} | " +
    "{kind:'add_grocery',name,quantity?,category?} | " +
    "{kind:'add_event',title,date?('YYYY-MM-DD'),time?('HH:MM AM/PM'),location?} | " +
    "{kind:'add_bill',title,amount?,dueDate?('YYYY-MM-DD')}. " +
    "If nothing needs to be created, end with 'ACTIONS:[]'. " +
    "NEVER write the word ACTION or ACTIONS anywhere inside your visible reply text, and never write raw JSON in the visible reply — " +
    "JSON only on the final ACTIONS: line. " +
    `Family context: ${JSON.stringify(context)}.`
  );
}

/** Heuristic: does this message likely ask to create something? Used to trigger the ACTION retry. */
function looksLikeCreateIntent(message: string): boolean {
  return /\b(add|create|remind|schedule|set\s?up|buy|order|put|book)\b/i.test(message);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callLLM(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  messages: ChatMessage[],
  insist: boolean
): Promise<string | null> {
  const completion = await zai.chat.completions.create({
    messages: insist
      ? [
          ...messages,
          {
            role: "system" as const,
            content:
              "REMINDER: You MUST end this reply with the final line 'ACTIONS:' followed by a compact JSON array (use [] if nothing to create). Do not omit it. Do not put JSON in the visible reply.",
          },
        ]
      : messages,
    thinking: { type: "disabled" },
  });
  return completion?.choices?.[0]?.message?.content ?? null;
}

/**
 * Extract proposed actions from an LLM reply.
 * Handles: 'ACTIONS:[...]', legacy single 'ACTION:{...}', multiple 'ACTION:{...}' lines,
 * optional markdown fences, and stray whitespace.
 */
function extractReply(rawReply: string): { content: string; actions: ProposedAction[] } {
  let text = rawReply.replace(/```(?:json)?/gi, "").trim();
  const marker = /(ACTIONS?\s*:)/i;
  const first = text.search(marker);

  if (first < 0) return { content: text.trim(), actions: [] };

  const content = text.slice(0, first).trim();
  const tail = text.slice(first);

  // Balanced-scan every {...} after the first marker and parse each as an action.
  const actions: ProposedAction[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < tail.length; i++) {
    const ch = tail[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = tail.slice(start, i + 1);
        try {
          const obj = JSON.parse(candidate) as ProposedAction;
          if (obj && typeof obj === "object" && typeof obj.kind === "string" && VALID_KINDS.has(obj.kind)) {
            // tolerate a bare array handed as one object
            actions.push(obj);
          }
        } catch {
          // skip unparseable object
        }
        start = -1;
      }
    }
  }

  // If a JSON array was provided, the scanner above already caught its objects —
  // but if it failed (e.g. nested arrays), try parsing the first [...] block too.
  if (actions.length === 0) {
    const arrStart = tail.indexOf("[");
    const arrEnd = tail.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        const parsed = JSON.parse(tail.slice(arrStart, arrEnd + 1)) as unknown;
        if (Array.isArray(parsed)) {
          for (const obj of parsed) {
            if (obj && typeof obj === "object" && typeof (obj as { kind?: unknown }).kind === "string") {
              actions.push(obj as ProposedAction);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // Drop {kind:'none'} placeholders and de-duplicate identical grocery names.
  const cleaned = actions.filter((a) => a.kind !== "none");
  const seen = new Set<string>();
  const deduped = cleaned.filter((a) => {
    const key = a.kind === "add_grocery" ? `add_grocery:${a.name.toLowerCase()}` : JSON.stringify(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { content, actions: deduped };
}

/** Resolve a member by case-insensitive name OR relation (e.g. "Dad"). */
async function resolveMemberId(familyId: string, query: string): Promise<string | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const members = await db.member.findMany({ where: { familyId } });
  const found = members.find(
    (m) =>
      m.name.toLowerCase() === q ||
      m.relation.toLowerCase() === q ||
      m.name.toLowerCase().includes(q) ||
      m.name.toLowerCase().split(" ")[0] === q
  );
  return found?.id ?? null;
}

/** Execute an accepted proposed action and log the corresponding activity. */
async function executeAction(
  action: ProposedAction,
  actor: { id: string; name: string },
  familyId: string
): Promise<string | null> {
  switch (action.kind) {
    case "add_task": {
      const title = typeof action.title === "string" ? action.title.trim() : "";
      if (!title) return null;
      const assigneeId =
        typeof action.assigneeName === "string" ? await resolveMemberId(familyId, action.assigneeName) : null;
      let dueAt: Date | null = null;
      if (typeof action.time === "string") {
        const t = parseTimeLabel(action.time);
        if (t) {
          dueAt = new Date();
          dueAt.setHours(t.h, t.m, 0, 0);
        }
      }
      await db.task.create({
        data: {
          familyId,
          title,
          creatorId: actor.id,
          assigneeId,
          dueAt,
          recurring: typeof action.recurring === "string" && action.recurring ? action.recurring : null,
        },
      });
      await db.activityLog.create({
        data: { familyId, actorId: actor.id, actor: actor.name, action: "created task via AI assistant", target: title },
      });
      return `task "${title}"`;
    }
    case "add_grocery": {
      const name = typeof action.name === "string" ? action.name.trim() : "";
      if (!name) return null;
      // SQLite has no case-insensitive filter — dedupe in JS.
      const needed = await db.groceryItem.findMany({ where: { familyId, status: "needed" }, select: { name: true } });
      if (needed.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
        return `${name} (already on the list)`;
      }
      await db.groceryItem.create({
        data: {
          familyId,
          name,
          quantity: typeof action.quantity === "string" ? action.quantity : "",
          category:
            typeof action.category === "string" && action.category ? action.category : "Other",
          addedById: actor.id,
        },
      });
      await db.activityLog.create({
        data: { familyId, actorId: actor.id, actor: actor.name, action: "added grocery via AI assistant", target: name },
      });
      return name;
    }
    case "add_event": {
      const title = typeof action.title === "string" ? action.title.trim() : "";
      if (!title) return null;
      const day = typeof action.date === "string" ? parseISODate(action.date) : null;
      const time = typeof action.time === "string" ? parseTimeLabel(action.time) : null;
      const startAt = new Date(day ?? new Date());
      startAt.setHours(time ? time.h : 18, time ? time.m : 0, 0, 0);
      await db.event.create({
        data: {
          familyId,
          title,
          startAt,
          createdById: actor.id,
          location:
            typeof action.location === "string" && action.location ? action.location : null,
        },
      });
      await db.activityLog.create({
        data: { familyId, actorId: actor.id, actor: actor.name, action: "created event via AI assistant", target: title },
      });
      return `event "${title}"`;
    }
    case "add_bill": {
      const title = typeof action.title === "string" ? action.title.trim() : "";
      if (!title) return null;
      const dueDate = typeof action.dueDate === "string" ? parseISODate(action.dueDate) : null;
      const due = dueDate ?? new Date();
      if (!dueDate) due.setDate(due.getDate() + 7); // default: one week out
      due.setHours(9, 0, 0, 0);
      const amount =
        typeof action.amount === "number" && Number.isFinite(action.amount) && action.amount > 0
          ? action.amount
          : 0;
      await db.bill.create({ data: { familyId, title, amount, dueDate: due, createdById: actor.id } });
      await db.activityLog.create({
        data: { familyId, actorId: actor.id, actor: actor.name, action: "created bill via AI assistant", target: title },
      });
      return `bill "${title}"`;
    }
    default:
      return null;
  }
}

/** GET /api/assistant — latest 50 messages, oldest first. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (isGuardFailure(auth)) return auth;
    const rows = await db.assistantMessage.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    rows.reverse();
    return NextResponse.json({ messages: rows.map(serializeRow) });
  } catch (e) {
    console.error("GET /api/assistant failed:", e);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/** POST /api/assistant — save user message, get LLM reply, extract the action batch. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (isGuardFailure(auth)) return auth;
    // LLM calls are costly — one conversation turn every few seconds max.
    const limited = rateLimit(`assistant:${auth.id}`, 20, 5 * 60_000);
    if (limited) return limited;

    // The assistant acts on the caller's real family; require an active membership.
    const membership = await db.membership.findFirst({
      where: { userId: auth.id, status: "active" },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Create or join a family first — then I can help with your home." },
        { status: 403 }
      );
    }

    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

    await db.assistantMessage.create({
      data: { userId: auth.id, role: "user", content: message, action: null, actionStatus: null },
    });

    // Recent conversation so the assistant keeps context across turns.
    const historyRows = await db.assistantMessage.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    historyRows.reverse();

    let reply: string | null = null;
    try {
      const context = await buildContext(membership.familyId);
      const zai = await ZAI.create();
      const chat: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(context) },
        ...historyRows
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map((r) => ({ role: r.role as "user" | "assistant", content: r.content })),
      ];
      reply = await callLLM(zai, chat, false);
      // The LLM sometimes omits the mandatory ACTIONS line on create-intent messages — retry once.
      if (reply && looksLikeCreateIntent(message) && !/(ACTIONS?\s*:)/i.test(reply)) {
        console.log("Assistant reply missing ACTIONS line — retrying with insistence");
        const retried = await callLLM(zai, chat, true).catch(() => null);
        if (retried && /(ACTIONS?\s*:)/i.test(retried)) reply = retried;
      }
    } catch (e) {
      console.error("Assistant LLM call failed:", e);
      reply = null;
    }

    if (!reply || !reply.trim()) {
      const fallback = await db.assistantMessage.create({
        data: {
          userId: auth.id,
          role: "assistant",
          content: "I couldn't reach the AI service just now. Please try again in a moment.",
          action: null,
          actionStatus: null,
        },
      });
      return NextResponse.json(serializeRow(fallback));
    }

    const { content, actions } = extractReply(reply);
    const realActions = actions.filter((a) => a.kind !== "none");

    const assistantMessage = await db.assistantMessage.create({
      data: {
        userId: auth.id,
        role: "assistant",
        content,
        action: realActions.length > 0 ? JSON.stringify(realActions) : null,
        actionStatus: realActions.length > 0 ? "proposed" : null,
      },
    });
    return NextResponse.json(serializeRow(assistantMessage));
  } catch (e) {
    console.error("POST /api/assistant failed:", e);
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 });
  }
}

/** PATCH /api/assistant — { id, actionStatus }. "accepted" executes the full proposed batch. */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (isGuardFailure(auth)) return auth;

    // Executing proposals needs the caller's real family — same rule as POST.
    const membership = await db.membership.findFirst({
      where: { userId: auth.id, status: "active" },
    });

    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const actionStatus = body.actionStatus;
    if (actionStatus !== "accepted" && actionStatus !== "declined") {
      return NextResponse.json(
        { error: 'actionStatus must be "accepted" or "declined"' },
        { status: 400 }
      );
    }

    const message = await db.assistantMessage.findUnique({ where: { id } });
    if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const actor = req.headers.get("X-HS-Actor") ?? "Family";

    if (actionStatus === "accepted") {
      const actions = parseActions(message.action).filter((a) => a.kind !== "none");
      const created: string[] = [];
      for (const action of actions) {
        if (!membership) {
          return NextResponse.json(
            { error: "Create or join a family first — then I can add things for your home." },
            { status: 403 }
          );
        }
        const result = await executeAction(action, { id: auth.id, name: auth.name }, membership.familyId);
        if (result) created.push(result);
      }
      if (created.length > 0 && message.content.length < 2000) {
        const note = `\nCreated: ${created.join(", ")}.`;
        await db.assistantMessage.update({
          where: { id },
          data: { content: message.content + note },
        });
      }
    }

    const updated = await db.assistantMessage.update({
      where: { id },
      data: { actionStatus },
    });
    return NextResponse.json(serializeRow(updated));
  } catch (e) {
    console.error("PATCH /api/assistant failed:", e);
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}
