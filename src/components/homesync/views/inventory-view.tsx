"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CookingPot,
  Minus,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  SprayCan,
  Trash2,
  Wheat,
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
import { apiSend, timeAgo, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { InventoryItem } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";

const UNITS = ["kg", "L", "pcs", "bottle", "pack"];
const INV_CATEGORIES = ["Pantry", "Kitchen", "Cleaning", "Other"];
/** Category → Lucide icon (emoji-free, monochrome — the label carries the meaning). */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  Pantry: Wheat,
  Kitchen: CookingPot,
  Cleaning: SprayCan,
  Other: Package,
};

function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON[category] ?? Package;
}

/** Parse a numeric form field, falling back to `fallback` for empty/invalid input. */
function numOr(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

interface ItemForm {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  lowThreshold: string;
}

const EMPTY_ADD_FORM: ItemForm = {
  name: "",
  quantity: "1",
  unit: "pcs",
  category: "Other",
  lowThreshold: "0",
};

export function InventoryView() {
  const { data, loading, error, refresh } = useResource<InventoryItem[]>("/api/inventory");
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);
  const quickAdd = useAppStore((s) => s.quickAdd);
  const consumeQuickAdd = useAppStore((s) => s.consumeQuickAdd);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<ItemForm>(EMPTY_ADD_FORM);
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(EMPTY_ADD_FORM);

  // Quick-add entry point (e.g. from the shell "+" menu).
  useEffect(() => {
    if (quickAdd === "inventory" && writable) {
      setAddOpen(true);
      consumeQuickAdd();
    }
  }, [quickAdd, consumeQuickAdd, writable]);

  const items = data ?? [];

  // Categories present in the data, in canonical order first.
  const presentCategories = useMemo(() => {
    const seen = new Set(items.map((i) => i.category));
    const canonical = INV_CATEGORIES.filter((c) => seen.has(c));
    const extra = Array.from(seen).filter((c) => !INV_CATEGORIES.includes(c));
    return [...canonical, ...extra];
  }, [items]);

  const visibleItems = useMemo(
    () => (categoryFilter === "all" ? items : items.filter((i) => i.category === categoryFilter)),
    [items, categoryFilter]
  );

  const lowItems = items.filter((i) => i.quantity <= i.lowThreshold);

  const openAdd = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const name = addForm.name.trim();
    const quantity = numOr(addForm.quantity, NaN);
    if (!name || !Number.isFinite(quantity) || saving) return;
    setSaving(true);
    try {
      await apiSend("/api/inventory", "POST", {
        name,
        quantity: Math.max(0, quantity),
        unit: addForm.unit,
        category: addForm.category,
        lowThreshold: Math.max(0, numOr(addForm.lowThreshold, 0)),
      });
      toast.success(`"${name}" added to home inventory`);
      setAddOpen(false);
      setAddForm(EMPTY_ADD_FORM);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setEditForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      category: item.category,
      lowThreshold: String(item.lowThreshold),
    });
  };

  const submitEdit = async () => {
    if (!editItem || saving) return;
    const name = editForm.name.trim();
    const quantity = numOr(editForm.quantity, NaN);
    if (!name || !Number.isFinite(quantity) || saving) return;
    setSaving(true);
    try {
      await apiSend("/api/inventory", "PATCH", {
        id: editItem.id,
        name,
        quantity: Math.max(0, quantity),
        unit: editForm.unit,
        category: editForm.category,
        lowThreshold: Math.max(0, numOr(editForm.lowThreshold, 0)),
      });
      toast.success(`Updated "${name}"`);
      setEditItem(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update item");
    } finally {
      setSaving(false);
    }
  };

  const stepQuantity = async (item: InventoryItem, delta: number) => {
    const next = Math.max(0, item.quantity + delta);
    if (next === item.quantity) return;
    try {
      await apiSend("/api/inventory", "PATCH", { id: item.id, quantity: next });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update quantity");
    }
  };

  const removeItem = async (item: InventoryItem) => {
    if (!window.confirm(`Remove "${item.name}" from home inventory?`)) return;
    try {
      await apiSend("/api/inventory", "DELETE", { id: item.id });
      toast.success(`Removed "${item.name}"`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove item");
    }
  };

  const itemFormFields = (form: ItemForm, setForm: (f: ItemForm) => void) => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="inv-name">Name *</Label>
        <Input
          id="inv-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Basmati rice"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="inv-quantity">Quantity *</Label>
          <Input
            id="inv-quantity"
            type="number"
            min="0"
            step="any"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unit</Label>
          <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
            <SelectTrigger className="w-full" aria-label="Unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="w-full" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INV_CATEGORIES.map((c) => {
                const Icon = categoryIcon(c);
                return (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {c}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-low">Low at</Label>
          <Input
            id="inv-low"
            type="number"
            min="0"
            step="any"
            value={form.lowThreshold}
            onChange={(e) => setForm({ ...form, lowThreshold: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">Alert when quantity ≤ this</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Home Inventory"
        sub="Track pantry, kitchen and household stock before it runs out"
        right={
          writable ? (
            <Button
              className="brand-gradient border-0 text-white shadow-md"
              onClick={openAdd}
            >
              <Plus /> Add Item
            </Button>
          ) : (
            <Chip tone="brand">View-only for your role</Chip>
          )
        }
      />

      {/* Low stock alert strip */}
      {lowItems.length > 0 ? (
        <GlassCard className="border-amber-400/60 p-3.5">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {lowItems.length} item{lowItems.length > 1 ? "s" : ""} running low
          </p>
        </GlassCard>
      ) : null}

      {/* Category filter */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-1.5">
                    <Boxes className="h-3.5 w-3.5" /> All categories
                  </span>
                </SelectItem>
                {presentCategories.map((c) => {
                  const Icon = categoryIcon(c);
                  return (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {c}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"} shown
          </p>
        </div>
      </GlassCard>

      {error ? (
        <GlassCard className="p-4 sm:p-5">
          <EmptyState icon={<PackageOpen className="h-10 w-10" />} title="Could not load inventory" sub={error} />
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={refresh}>
              Try again
            </Button>
          </div>
        </GlassCard>
      ) : loading && !data ? (
        <PageLoader label="Counting the shelves…" />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "No inventory items yet" : "Nothing in this category"}
          sub={
            items.length === 0
              ? "Add staples like rice, oil or detergent to start tracking stock"
              : "Try another category, or add an item to it"
          }
        />
      ) : (
        <div className="space-y-2.5">
          {visibleItems.map((item) => {
            const isLow = item.quantity <= item.lowThreshold;
            const Icon = categoryIcon(item.category);
            return (
              <GlassCard
                key={item.id}
                hover
                className={cn("p-3.5", isLow && "border-l-4 border-amber-400")}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass-inset text-foreground/70"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      {isLow ? <Chip tone="warning">Low</Chip> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Chip>{item.category}</Chip>
                      {item.lowThreshold > 0 ? <span>Low at ≤ {item.lowThreshold}</span> : null}
                      <span>• Updated {timeAgo(item.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 min-w-[64px] text-right text-sm font-bold">
                      {item.quantity} {item.unit}
                    </span>
                    {writable ? (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => stepQuantity(item, -1)}
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => stepQuantity(item, 1)}
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => openEdit(item)}
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-red-500"
                          onClick={() => removeItem(item)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Chip>View-only</Chip>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add item dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Add Inventory Item
            </DialogTitle>
            <DialogDescription>Track stock so the household never runs dry.</DialogDescription>
          </DialogHeader>
          {itemFormFields(addForm, setAddForm)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="brand-gradient border-0 text-white shadow-md"
              disabled={!addForm.name.trim() || addForm.quantity.trim() === "" || saving}
              onClick={submitAdd}
            >
              {saving ? "Adding…" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit item dialog */}
      <Dialog open={editItem !== null} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit {editItem?.name}
            </DialogTitle>
            <DialogDescription>Update stock details or the low-stock threshold.</DialogDescription>
          </DialogHeader>
          {itemFormFields(editForm, setEditForm)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button
              className="brand-gradient border-0 text-white shadow-md"
              disabled={!editForm.name.trim() || editForm.quantity.trim() === "" || saving}
              onClick={submitEdit}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
