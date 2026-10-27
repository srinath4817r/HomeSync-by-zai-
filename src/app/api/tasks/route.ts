import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Apply partial task fields from a request body. Returns an error message on invalid input. */
function taskFields(body: Record<string, unknown>): { data: Prisma.TaskUpdateInput; error: string | null } {
  const data: Prisma.TaskUpdateInput = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return { data, error: "title must be a non-empty string" };
    }
    data.title = body.title.trim();
  }
  if (typeof body.description === "string" || body.description === null) {
    data.description = body.description;
  }
  if (body.assigneeId === null || typeof body.assigneeId === "string") data.assigneeId = body.assigneeId;
  if (body.dueAt === null) data.dueAt = null;
  else if (typeof body.dueAt === "string") {
    const d = new Date(body.dueAt);
    if (Number.isNaN(d.getTime())) return { data, error: "dueAt must be a valid ISO datetime" };
    data.dueAt = d;
  }
  if (typeof body.priority === "string" && body.priority) data.priority = body.priority;
  if (typeof body.status === "string" && body.status) data.status = body.status;
  if (body.category === null || typeof body.category === "string") data.category = body.category;
  if (body.recurring === null || typeof body.recurring === "string") data.recurring = body.recurring;
  return { data, error: null };
}

/** GET /api/tasks?status=&assigneeId= — pending/in_progress first, then done; dueAt asc (nulls last). */
export async function GET(req: NextRequest) {
  try {
    await ensureSeed();
    const where: { status?: string; assigneeId?: string } = {};
    const status = req.nextUrl.searchParams.get("status");
    const assigneeId = req.nextUrl.searchParams.get("assigneeId");
    if (status) where.status = status;
    if (assigneeId) where.assigneeId = assigneeId;

    const tasks = await db.task.findMany({ where });
    tasks.sort((a, b) => {
      const doneA = a.status === "done" ? 1 : 0;
      const doneB = b.status === "done" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      const dueA = a.dueAt ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
      const dueB = b.dueAt ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
      return dueA - dueB;
    });
    return NextResponse.json(tasks);
  } catch (e) {
    console.error("GET /api/tasks failed:", e);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

/** POST /api/tasks — create a task. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    let dueAt: Date | null = null;
    if (typeof body.dueAt === "string") {
      dueAt = new Date(body.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        return NextResponse.json({ error: "dueAt must be a valid ISO datetime" }, { status: 400 });
      }
    }

    const created = await db.task.create({
      data: {
        title: body.title.trim(),
        description: typeof body.description === "string" ? body.description : null,
        assigneeId: typeof body.assigneeId === "string" ? body.assigneeId : null,
        dueAt,
        priority: typeof body.priority === "string" && body.priority ? body.priority : "medium",
        category: typeof body.category === "string" ? body.category : null,
        recurring: typeof body.recurring === "string" ? body.recurring : null,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/tasks failed:", e);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

/** PATCH /api/tasks — update partial task fields; logs activity when completed. */
export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const { data, error } = taskFields(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const updated = await db.task.update({ where: { id }, data });

    if (data.status === "done" && existing.status !== "done") {
      const assigneeId =
        (typeof body.assigneeId === "string" ? body.assigneeId : undefined) ?? existing.assigneeId;
      const assignee = assigneeId ? await db.member.findUnique({ where: { id: assigneeId } }) : null;
      await db.activityLog.create({
        data: { actor: assignee?.name ?? req.headers.get("X-HS-Actor") ?? "Family", action: "completed task", target: updated.title },
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/tasks failed:", e);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

/** DELETE /api/tasks — remove a task by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/tasks failed:", e);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
