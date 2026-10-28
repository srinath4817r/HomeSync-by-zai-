import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { logActivity } from "@/lib/homesync/server";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

function serialize(d: {
  id: string; title: string; type: string; ownerName: string; sizeLabel: string;
  visibility: string; createdAt: Date;
}) {
  return {
    id: d.id,
    title: d.title,
    type: d.type,
    ownerName: d.ownerName,
    sizeLabel: d.sizeLabel,
    visibility: d.visibility,
    createdAt: d.createdAt.toISOString(),
  };
}

/** GET /api/documents — household docs + my private docs. Private docs of OTHERS are never returned. */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const docs = await db.docItem.findMany({
    where: {
      familyId: ctx.familyId,
      OR: [{ visibility: { not: "private" } }, { createdById: ctx.user.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json(docs.map(serialize));
}

/** POST /api/documents — register a document record (metadata; file storage needs object storage config). */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const title = String(body.title ?? "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Enter a document title." }, { status: 400 });

  const doc = await db.docItem.create({
    data: {
      familyId: ctx.familyId,
      title,
      type: typeof body.type === "string" && body.type ? body.type.slice(0, 20) : "other",
      ownerName: ctx.user.name,
      sizeLabel: typeof body.sizeLabel === "string" && body.sizeLabel ? body.sizeLabel.slice(0, 20) : "—",
      visibility: ["household", "private"].includes(String(body.visibility)) ? String(body.visibility) : "household",
      createdById: ctx.user.id,
    },
  });
  await logActivity(ctx.familyId, ctx.user, "added document", title);
  return NextResponse.json({ document: serialize(doc) });
}

/** PATCH /api/documents — owner or admin can rename / change visibility. */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const doc = await db.docItem.findUnique({ where: { id } });
  if (!doc || doc.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.createdById !== ctx.user.id && !ctx.isAdmin) {
    return NextResponse.json({ error: "Only the owner or the Family Admin can edit this document." }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 120);
  if (typeof body.type === "string" && body.type) data.type = body.type.slice(0, 20);
  if (["household", "private"].includes(String(body.visibility))) data.visibility = body.visibility;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const updated = await db.docItem.update({ where: { id }, data });
  return NextResponse.json({ document: serialize(updated) });
}

/** DELETE /api/documents — owner or admin. */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const body = await readJson(req);
  const id = String(body.id ?? "");
  const doc = await db.docItem.findUnique({ where: { id } });
  if (!doc || doc.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.createdById !== ctx.user.id && !ctx.isAdmin) {
    return NextResponse.json({ error: "Only the owner or the Family Admin can delete this document." }, { status: 403 });
  }
  await db.docItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
