import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Random demo file size label like "312 KB" / "2.4 MB". */
function randomSizeLabel(): string {
  const kb = 100 + Math.floor(Math.random() * 4900); // 100 KB – ~4.9 MB
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/** GET /api/documents — newest first. */
export async function GET() {
  try {
    await ensureSeed();
    const documents = await db.docItem.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(documents);
  } catch (e) {
    console.error("GET /api/documents failed:", e);
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }
}

/** POST /api/documents — register a document. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const created = await db.docItem.create({
      data: {
        title: body.title.trim(),
        type: typeof body.type === "string" && body.type ? body.type : "other",
        visibility:
          typeof body.visibility === "string" && body.visibility ? body.visibility : "household",
        ownerName:
          typeof body.ownerName === "string" && body.ownerName ? body.ownerName : req.headers.get("X-HS-Actor") ?? "Family",
        sizeLabel:
          typeof body.sizeLabel === "string" && body.sizeLabel ? body.sizeLabel : randomSizeLabel(),
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/documents failed:", e);
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 });
  }
}

/** DELETE /api/documents — remove a document by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.docItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    await db.docItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/documents failed:", e);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
