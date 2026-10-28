import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { logActivity } from "@/lib/homesync/server";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

function serialize(t: {
  id: string; title: string; description: string | null; assigneeId: string | null;
  dueAt: Date | null; priority: string; status: string; category: string | null;
  recurring: string | null; completedAt: Date | null; createdAt: Date;
}) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assigneeId: t.assigneeId,
    dueAt: t.dueAt?.toISOString() ?? null,
    priority: t.priority,
    status: t.status,
    category: t.category,
    recurring: t.recurring,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

/** GET /api/tasks — my family's tasks. */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const tasks = await db.task.findMany({
    where: { familyId: ctx.familyId },
    orderBy: [{ status: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json(tasks.map(serialize));
}

/** POST /api/tasks — create (creator attributed from the session). */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const title = String(body.title ?? "").trim().slice(0, 140);
  if (!title) return NextResponse.json({ error: "Enter a task title." }, { status: 400 });

  const priority = ["low", "medium", "high"].includes(String(body.priority)) ? String(body.priority) : "medium";
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null;
  const task = await db.task.create({
    data: {
      familyId: ctx.familyId,
      title,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null,
      creatorId: ctx.user.id,
      assigneeId: typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      priority,
      category: typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 30) : null,
      recurring: typeof body.recurring === "string" && body.recurring ? body.recurring : null,
    },
  });
  await logActivity(ctx.familyId, ctx.user, "added task", title);
  return NextResponse.json({ task: serialize(task) });
}

/** PATCH /api/tasks — update status/fields; completion recorded server-side. */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const task = await db.task.findUnique({ where: { id } });
  if (!task || task.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 140);
  if (typeof body.description === "string") data.description = body.description.trim().slice(0, 500) || null;
  if (["low", "medium", "high"].includes(String(body.priority))) data.priority = body.priority;
  if (["pending", "in_progress", "done"].includes(String(body.status))) {
    data.status = body.status;
    data.completedAt = body.status === "done" ? new Date() : null;
  }
  if (body.assigneeId === null || typeof body.assigneeId === "string") {
    data.assigneeId = body.assigneeId || null;
  }
  if (body.dueAt === null || typeof body.dueAt === "string") {
    const d = body.dueAt ? new Date(body.dueAt) : null;
    data.dueAt = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof body.recurring === "string") data.recurring = body.recurring || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const updated = await db.task.update({ where: { id }, data });
  if (data.status === "done") {
    await logActivity(ctx.familyId, ctx.user, "completed task", updated.title);
  }
  return NextResponse.json({ task: serialize(updated) });
}

/** DELETE /api/tasks */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const body = await readJson(req);
  const id = String(body.id ?? "");
  const task = await db.task.findUnique({ where: { id } });
  if (!task || task.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  await db.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
