"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  CircleAlert,
  ListChecks,
  ReceiptText,
  Send,
  ShoppingBasket,
  X,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { AssistantMessage, ProposedAction } from "@/lib/homesync/types";
import { apiSend, fmtTime, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { Chip, EmptyState, GlassCard, PageLoader, ViewTitle } from "@/components/homesync/glass";
import { SparkleFloat } from "@/components/homesync/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Show my schedule today",
  "Add biscuits, Gooday and Allout to the grocery list",
  "What do I need to buy?",
  "Where is my dad right now?",
  "Remind me to call the electrician at 6 PM",
  "Which AI model are you?",
] as const;

/** Proposed-action kind → Lucide icon (emoji-free). */
const ACTION_ICON: Record<Exclude<ProposedAction["kind"], "none">, LucideIcon> = {
  add_task: CheckCheck,
  add_grocery: ShoppingBasket,
  add_event: CalendarDays,
  add_bill: ReceiptText,
};

type ActionStatus = "accepted" | "declined";
type ActionableProposal = Exclude<ProposedAction, { kind: "none" }>;

/** Human-readable one-liner for a proposed action (spec §15 wording). */
function actionSummary(action: ActionableProposal): string {
  switch (action.kind) {
    case "add_task":
      return `Create task "${action.title}"${action.assigneeName ? ` for ${action.assigneeName}` : ""}${action.time ? ` at ${action.time}` : ""}${action.recurring ? ` (${action.recurring})` : ""}`;
    case "add_grocery":
      return `Add ${action.quantity ? `${action.quantity} ` : ""}${action.name} to the grocery list${action.category ? ` (${action.category})` : ""}`;
    case "add_event":
      return `Create event "${action.title}"${action.date ? ` on ${action.date}` : ""}${action.time ? ` at ${action.time}` : ""}`;
    case "add_bill":
      return `Add bill "${action.title}"${action.amount ? ` for ₹${action.amount}` : ""}${action.dueDate ? ` due ${action.dueDate}` : ""}`;
  }
}

/**
 * Defensively clean assistant prose before rendering:
 * - cut everything from the first ACTION/ACTIONS: marker to the end
 * - drop any leftover line that starts with ACTION(S): or is a bare {...} JSON payload
 */
function cleanContent(raw: string): string {
  let text = raw.replace(/ACTION(S)?:[\s\S]*$/i, "").trim();
  if (!text) text = raw.trim();
  const lines = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^ACTION(S)?:/i.test(t)) return false;
    if (t.startsWith("{")) return false;
    return true;
  });
  return lines.join("\n").trim();
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="glass-inset flex items-center gap-1 rounded-2xl rounded-bl-sm px-4 py-3" aria-label="Assistant is typing">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

/** Glass card listing every proposed action in the batch; confirm/decline operates on the whole batch. */
function BatchProposalCard({
  message,
  pending,
  writable,
  onAction,
}: {
  message: AssistantMessage;
  pending: boolean;
  writable: boolean;
  onAction: (id: string, status: ActionStatus) => void;
}) {
  const actions = message.actions.filter((a): a is ActionableProposal => a.kind !== "none");
  if (actions.length === 0) return null;

  if (message.actionStatus === "accepted") {
    return (
      <div className="mt-1.5">
        <Chip tone="success">
          <CheckCheck className="h-3 w-3" aria-hidden /> {actions.length} created
        </Chip>
      </div>
    );
  }
  if (message.actionStatus === "declined") {
    return (
      <div className="mt-1.5">
        <Chip tone="default">Declined</Chip>
      </div>
    );
  }
  if (message.actionStatus !== "proposed") return null;

  return (
    <div className="glass-inset mt-2 rounded-2xl rounded-bl-sm p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        {actions.length} {actions.length === 1 ? "item" : "items"} ready to create
      </p>
      <ul className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-background/40">
        {actions.map((action, i) => {
          const ActionIcon = ACTION_ICON[action.kind];
          return (
            <li
              key={`${message.id}-${action.kind}-${i}`}
              className={cn("flex items-start gap-2 px-2.5 py-2", i > 0 && "border-t border-border/50")}
            >
              <ActionIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="text-xs leading-relaxed">{actionSummary(action)}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {writable ? (
          <>
            <Button
              size="sm"
              className="brand-gradient h-8 border-0 text-white"
              disabled={pending}
              onClick={() => onAction(message.id, "accepted")}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Confirm &amp; create
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={pending}
              onClick={() => onAction(message.id, "declined")}
            >
              <X className="h-3.5 w-3.5" /> Decline
            </Button>
          </>
        ) : (
          <Chip tone="brand">View-only for your role</Chip>
        )}
      </div>
    </div>
  );
}

function Bubble({
  message,
  pending,
  writable,
  onAction,
}: {
  message: AssistantMessage;
  pending: boolean;
  writable: boolean;
  onAction: (id: string, status: ActionStatus) => void;
}) {
  const isUser = message.role === "user";
  const content = isUser ? message.content : cleanContent(message.content);
  const hasActions = !isUser && message.actions.some((a) => a.kind !== "none");
  // An assistant row with no surviving prose and no actions renders an honest
  // placeholder instead of an invisible message.
  const isEmptyAssistant = !isUser && !content && !hasActions;
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[72%]", isUser && "items-end")}>
        {content ? (
          <div
            className={cn(
              "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              isUser ? "brand-gradient rounded-br-sm text-white" : "glass-inset rounded-bl-sm"
            )}
          >
            {content}
          </div>
        ) : isEmptyAssistant ? (
          <p className="text-xs italic text-muted-foreground">The assistant sent an empty reply.</p>
        ) : null}
        {hasActions ? (
          <BatchProposalCard message={message} pending={pending} writable={writable} onAction={onAction} />
        ) : null}
        <p className={cn("mt-1 text-[10px] text-muted-foreground", isUser && "text-right")}>
          {fmtTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function AssistantView() {
  const { data, loading, error, refresh } = useResource<{ messages: AssistantMessage[] }>("/api/assistant");
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const messages = data?.messages ?? [];

  // Auto-scroll to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, sendError]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setSending(true);
    setSendError(null);
    setLastSent(message);
    try {
      await apiSend("/api/assistant", "POST", { message });
      setInput("");
      setLastSent(null);
      await refresh();
    } catch (e) {
      // Surface the server's own message inline as an error bubble; keep the
      // failed text in the input so the user can edit or retry it.
      setInput(message);
      setSendError(e instanceof Error ? e.message : "Could not reach the assistant");
    } finally {
      setSending(false);
    }
  }

  async function handleAction(id: string, actionStatus: ActionStatus) {
    setPendingActionId(id);
    try {
      await apiSend("/api/assistant", "PATCH", { id, actionStatus });
      if (actionStatus === "accepted") toast.success("Created!");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the proposal");
    } finally {
      setPendingActionId(null);
    }
  }

  const title = "AI Assistant";

  if (loading) {
    return (
      <div className="space-y-4">
        <ViewTitle title={title} sub="Ask, propose, confirm — your home in one chat" />
        <PageLoader label="Waking up your assistant…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ViewTitle title={title} sub="Ask, propose, confirm — your home in one chat" />
        <GlassCard className="p-5">
          <EmptyState title="Couldn't load the conversation" sub={error} />
          <div className="mt-4 flex justify-center">
            <Button className="brand-gradient border-0 text-white" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewTitle title={title} sub="Ask, propose, confirm — your home in one chat" />
      <GlassCard className="flex h-[calc(100vh-14rem)] min-h-[480px] flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
              aria-hidden
            >
              <SparkleFloat size={18} />
            </span>
            <h2 className="truncate text-sm font-semibold">AI Assistant</h2>
            <Chip tone="brand">Proposes • You confirm</Chip>
          </div>
          <p className="w-full text-xs text-muted-foreground sm:w-auto">
            The assistant only sees what you&apos;re allowed to see.
          </p>
        </div>

        {/* Messages */}
        <div ref={scrollRef} aria-live="polite" className="scrollbar-slim flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <EmptyState
              icon={<SparkleFloat className="text-primary" />}
              title="Say hello to your home assistant"
              sub="I can add tasks, groceries, events and bills — you confirm before anything is created."
            />
          ) : (
            messages.map((m) => (
              <Bubble
                key={m.id}
                message={m}
                pending={pendingActionId === m.id}
                writable={writable}
                onAction={(id, status) => void handleAction(id, status)}
              />
            ))
          )}
          {sending ? <TypingBubble /> : null}
        </div>

        {/* Inline delivery-failure bubble — the server's message, never invented */}
        {sendError ? (
          <div className="px-4 pb-2">
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 px-3.5 py-3"
            >
              <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">Message not delivered</p>
                <p className="mt-0.5 break-words text-xs leading-relaxed text-red-700/90 dark:text-red-300/90">
                  {sendError}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-red-500/40 px-2.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  disabled={sending || !lastSent}
                  onClick={() => void send(lastSent ?? undefined)}
                >
                  Retry
                </Button>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  className="rounded-md p-1 text-red-600/70 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-red-400/70"
                  onClick={() => setSendError(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Suggested prompts (first-run only) */}
        {messages.length <= 1 ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={sending}
                onClick={() => void send(s)}
                className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {/* Input row */}
        <form
          className="flex items-center gap-2 border-t border-border/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your home…"
            disabled={sending}
            aria-label="Message the assistant"
            className="glass-inset border-0 focus-visible:ring-primary/40"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            className="brand-gradient shrink-0 border-0 text-white"
            disabled={sending || !input.trim()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
