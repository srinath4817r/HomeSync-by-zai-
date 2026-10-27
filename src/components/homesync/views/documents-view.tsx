"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CreditCard,
  FileText,
  FolderLock,
  FolderOpen,
  LockKeyhole,
  Pill,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Chip,
  EmptyState,
  GlassCard,
  PageLoader,
  ViewTitle,
} from "@/components/homesync/glass";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiSend, fmtDate, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { DocItem } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";

const DOC_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "receipt", label: "Receipts", icon: ReceiptText },
  { value: "warranty", label: "Warranties", icon: ShieldCheck },
  { value: "prescription", label: "Prescriptions", icon: Pill },
  { value: "bill", label: "Bills", icon: Zap },
  { value: "id", label: "IDs & Policies", icon: CreditCard },
  { value: "manual", label: "Manuals", icon: BookOpen },
];

const TYPE_FILTERS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "All", icon: FolderOpen },
  ...DOC_TYPES,
];

function typeMeta(type: string): { icon: LucideIcon; label: string } {
  const found = DOC_TYPES.find((t) => t.value === type);
  return found ? { icon: found.icon, label: found.label } : { icon: FileText, label: "Other" };
}

/** Owner defaults to the signed-in user — never a hardcoded name. */
function emptyForm(ownerName: string) {
  return { title: "", type: "other", visibility: "household", ownerName };
}

export function DocumentsView() {
  const { data, loading, error, refresh } = useResource<DocItem[]>("/api/documents");
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);
  const quickAdd = useAppStore((s) => s.quickAdd);
  const consumeQuickAdd = useAppStore((s) => s.consumeQuickAdd);

  const [filter, setFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => emptyForm(user?.name ?? ""));

  // Quick-add entry point (e.g. from the shell "+" menu).
  useEffect(() => {
    if (quickAdd === "doc" && writable) {
      setAddOpen(true);
      consumeQuickAdd();
    }
  }, [quickAdd, consumeQuickAdd, writable]);

  const docs = data ?? [];
  const visible = useMemo(
    () => (filter === "all" ? docs : docs.filter((d) => d.type === filter)),
    [docs, filter]
  );

  const canSubmit = form.title.trim().length > 0;

  const openAdd = () => {
    setForm(emptyForm(user?.name ?? ""));
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      await apiSend("/api/documents", "POST", {
        title: form.title.trim(),
        type: form.type,
        visibility: form.visibility,
        ownerName: form.ownerName.trim() || user?.name || "Family",
      });
      toast.success("Document metadata added — file upload comes with private storage integration");
      setAddOpen(false);
      setForm(emptyForm(user?.name ?? ""));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add document");
    } finally {
      setSaving(false);
    }
  };

  const removeDoc = async (doc: DocItem) => {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await apiSend("/api/documents", "DELETE", { id: doc.id });
      toast.success(`Deleted "${doc.title}"`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete document");
    }
  };

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Documents"
        sub="The family locker — receipts, warranties, IDs and more"
        right={
          writable ? (
            <Button
              className="brand-gradient border-0 text-white shadow-md"
              onClick={openAdd}
            >
              <Plus /> Add Document
            </Button>
          ) : (
            <Chip tone="brand">View-only for your role</Chip>
          )
        }
      />

      {/* Privacy note (static, honest) */}
      <GlassCard className="border-amber-400/40 p-3.5">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <LockKeyhole aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Prescriptions and private documents are visible only to their owner and designated
            caregivers.
          </span>
        </p>
      </GlassCard>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((t) => {
          const active = filter === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setFilter(t.value)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition",
                active
                  ? "brand-gradient border-0 text-white shadow-md"
                  : "glass-inset border-white/40 text-muted-foreground hover:text-foreground dark:border-white/10"
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <GlassCard className="p-4 sm:p-5">
          <EmptyState icon={<FolderLock className="h-10 w-10" />} title="Could not load documents" sub={error} />
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={refresh}>
              Try again
            </Button>
          </div>
        </GlassCard>
      ) : loading && !data ? (
        <PageLoader label="Opening the family locker…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No documents yet" : "Nothing in this category"}
          sub={
            filter === "all"
              ? "Add your first document to start building the family locker"
              : "Try another filter, or add a document of this type"
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((doc) => {
            const meta = typeMeta(doc.type);
            const TypeIcon = meta.icon;
            return (
              <GlassCard key={doc.id} hover className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl glass-inset"
                    aria-hidden
                  >
                    <TypeIcon className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold" title={doc.title}>
                        {doc.title}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => removeDoc(doc)}
                        disabled={!writable}
                        aria-label={`Delete ${doc.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {doc.ownerName} • {doc.sizeLabel} • {fmtDate(doc.createdAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Chip tone={doc.visibility === "private" ? "warning" : "default"}>
                        {doc.visibility === "private" ? (
                          <>
                            <LockKeyhole className="h-3 w-3" /> Private
                          </>
                        ) : (
                          <>
                            <UsersRound className="h-3 w-3" /> Household
                          </>
                        )}
                      </Chip>
                      <Chip>{meta.label}</Chip>
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add document dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Add Document
            </DialogTitle>
            <DialogDescription>
              Register a document in the family locker. File upload arrives with private storage
              integration.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 scrollbar-slim">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title *</Label>
              <Input
                id="doc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. AC warranty card"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="w-full" aria-label="Document type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-1.5">
                          <t.icon className="h-3.5 w-3.5" /> {t.label}
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value="other">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Other
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <Select
                  value={form.visibility}
                  onValueChange={(v) => setForm({ ...form, visibility: v })}
                >
                  <SelectTrigger className="w-full" aria-label="Visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="household">
                      <span className="flex items-center gap-1.5">
                        <UsersRound className="h-3.5 w-3.5" /> Household
                      </span>
                    </SelectItem>
                    <SelectItem value="private">
                      <span className="flex items-center gap-1.5">
                        <LockKeyhole className="h-3.5 w-3.5" /> Private
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-owner">Owner</Label>
              <Input
                id="doc-owner"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                placeholder={user?.name || "Family member"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="brand-gradient border-0 text-white shadow-md"
              disabled={!canSubmit || saving}
              onClick={submitAdd}
            >
              {saving ? "Adding…" : "Add document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
