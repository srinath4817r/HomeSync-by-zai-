"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Compass,
  Drumstick,
  Eye,
  Heart,
  Leaf,
  Lock,
  Milk,
  Package,
  Plus,
  ShoppingBasket,
  Sparkles,
  SprayCan,
  Trash2,
  TriangleAlert,
  Users,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { GroceryItem, Member } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  MemberAvatar,
  PageLoader,
  PriorityDot,
  ViewTitle,
} from "@/components/homesync/glass";

type ListFilter = "all" | "needed" | "purchased";

const LIST_FILTERS: { key: ListFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needed", label: "Needed" },
  { key: "purchased", label: "Purchased" },
];

const CATEGORIES = ["Dairy", "Vegetables", "Meat", "Groceries", "Household", "Other"] as const;

const GROUPS: { key: string; icon: LucideIcon }[] = [
  { key: "Dairy", icon: Milk },
  { key: "Vegetables", icon: Leaf },
  { key: "Meat", icon: Drumstick },
  { key: "Groceries", icon: Wheat },
  { key: "Household", icon: SprayCan },
  { key: "Other", icon: Package },
];

const PRIORITIES = ["low", "medium", "high"] as const;

/** Honest local keyword heuristic for auto-categorization. */
const CATEGORY_RULES: [string, string[]][] = [
  ["Dairy", ["milk", "oat", "cheese", "yogurt", "curd", "butter", "paneer", "cream"]],
  [
    "Vegetables",
    [
      "tomato", "onion", "potato", "vegetable", "fruit", "green", "carrot", "spinach",
      "apple", "banana", "coriander", "mint", "lettuce", "capsicum", "cucumber",
    ],
  ],
  ["Meat", ["chicken", "fish", "meat", "egg", "prawn", "mutton"]],
  ["Groceries", ["rice", "wheat", "oil", "flour", "sugar", "salt", "dal", "atta", "spice"]],
  ["Household", ["detergent", "soap", "cleaner", "shampoo", "toothpaste", "tissue", "sanitizer"]],
];

function guessCategory(name: string): string | null {
  const n = name.toLowerCase();
  for (const [cat, words] of CATEGORY_RULES) {
    if (words.some((w) => n.includes(w))) return cat;
  }
  return null;
}

/** Shown where mutation controls would be, for read-only roles. */
function ViewOnlyChip() {
  return (
    <Chip tone="default">
      <Eye className="h-3 w-3" /> View-only for your role
    </Chip>
  );
}

export function GroceriesView() {
  const { data, loading, error, refresh } = useResource<GroceryItem[]>("/api/groceries");
  const { data: membersData } = useResource<Member[]>("/api/members");
  const quickAdd = useAppStore((s) => s.quickAdd);
  const consumeQuickAdd = useAppStore((s) => s.consumeQuickAdd);
  const setView = useAppStore((s) => s.setView);
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);

  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [autoBusy, setAutoBusy] = useState(false);

  // Add-item dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("Other");
  const [priority, setPriority] = useState("medium");
  const [visibility, setVisibility] = useState("household");
  const [assignee, setAssignee] = useState("none");
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => data ?? [], [data]);
  const members = useMemo(() => membersData ?? [], [membersData]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const openAdd = useCallback(() => {
    setName("");
    setQuantity("");
    setCategory("Other");
    setPriority("medium");
    setVisibility("household");
    setAssignee("none");
    setAddOpen(true);
  }, []);

  // Global quick-add signal (ignored for read-only roles)
  useEffect(() => {
    if (quickAdd === "grocery") {
      consumeQuickAdd();
      if (writable) openAdd();
    }
  }, [quickAdd, consumeQuickAdd, openAdd, writable]);

  const filtered = items.filter((it) => {
    if (listFilter === "needed") return it.status === "needed";
    if (listFilter === "purchased") return it.status === "purchased";
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, GroceryItem[]>();
    for (const it of filtered) {
      const key = GROUPS.some((g) => g.key === it.category) ? it.category : "Other";
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.status === "purchased" ? 1 : 0) - (b.status === "purchased" ? 1 : 0));
    }
    return GROUPS.map((g) => ({ ...g, items: map.get(g.key) ?? [] })).filter(
      (g) => g.items.length > 0
    );
  }, [filtered]);

  const neededCount = items.filter((it) => it.status === "needed").length;

  async function togglePurchased(item: GroceryItem, purchased: boolean) {
    try {
      await apiSend("/api/groceries", "PATCH", {
        id: item.id,
        status: purchased ? "purchased" : "needed",
      });
      if (purchased) toast.success(`Got the ${item.name}`);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update item");
    }
  }

  async function deleteItem(item: GroceryItem) {
    try {
      await apiSend("/api/groceries", "DELETE", { id: item.id });
      toast.success("Item removed");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove item");
    }
  }

  async function autoCategorize() {
    setAutoBusy(true);
    try {
      let n = 0;
      for (const it of items) {
        if (it.category && it.category !== "Other") continue;
        const guess = guessCategory(it.name);
        if (!guess) continue;
        await apiSend("/api/groceries", "PATCH", { id: it.id, category: guess });
        n += 1;
      }
      if (n > 0) {
        toast.success(`Categorized ${n} item${n === 1 ? "" : "s"}`);
        void refresh();
      } else {
        toast.info("Everything is already categorized");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-categorize failed");
    } finally {
      setAutoBusy(false);
    }
  }

  const canSubmit = name.trim().length > 0;

  async function submitItem() {
    setSaving(true);
    try {
      await apiSend("/api/groceries", "POST", {
        name: name.trim(),
        quantity: quantity.trim(),
        category,
        priority,
        status: "needed",
        visibility,
        assigneeId: assignee === "none" ? null : assignee,
      });
      toast.success("Item added");
      setAddOpen(false);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add item");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Groceries" sub="Shared shopping list for the whole family" />
        <PageLoader label="Loading groceries…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Groceries" sub="Shared shopping list for the whole family" />
        <EmptyState icon={<TriangleAlert className="h-10 w-10" />} title="Couldn't load" sub={error} />
        <Button variant="outline" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Groceries"
        sub="Shared shopping list for the whole family"
        right={
          writable ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={autoBusy || items.length === 0}
                onClick={() => void autoCategorize()}
              >
                <Sparkles className="size-4" /> Auto-categorize
              </Button>
              <Button
                size="sm"
                className="brand-gradient border-0 text-white shadow-md"
                onClick={openAdd}
              >
                <Plus className="size-4" /> Add Item
              </Button>
            </div>
          ) : (
            <ViewOnlyChip />
          )
        }
      />

      {/* Filter tabs */}
      <GlassCard className="p-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {LIST_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={listFilter === f.key}
              onClick={() => setListFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                listFilter === f.key
                  ? "brand-gradient border-0 text-white shadow-md"
                  : "border-white/40 text-muted-foreground hover:text-foreground dark:border-white/10"
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} on the list
          </span>
        </div>
      </GlassCard>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <EmptyState
          icon={<ShoppingBasket className="h-10 w-10" />}
          title="Nothing to buy"
          sub="Add items to your shopping list and tick them off at the store."
        />
      ) : (
        <GlassCard className="p-4 sm:p-5">
          <div className="max-h-96 space-y-5 overflow-y-auto pr-1 scrollbar-slim">
            {grouped.map((g) => (
              <div key={g.key}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="glass-inset flex h-7 w-7 items-center justify-center rounded-lg text-foreground/70"
                    aria-hidden
                  >
                    <g.icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold">{g.key}</h3>
                  <Chip>{g.items.length}</Chip>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((it) => {
                    const purchased = it.status === "purchased";
                    const assignee = it.assigneeId ? memberById.get(it.assigneeId) : undefined;
                    return (
                      <div
                        key={it.id}
                        className="group flex items-center gap-3 rounded-xl border border-white/50 bg-white/30 p-2.5 dark:border-white/10 dark:bg-white/5"
                      >
                        <Checkbox
                          checked={purchased}
                          disabled={!writable}
                          aria-label={purchased ? `Need ${it.name} again` : `Mark ${it.name} bought`}
                          onCheckedChange={(v) => void togglePurchased(it, v === true)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                "truncate text-sm font-medium",
                                purchased && "line-through decoration-2"
                              )}
                            >
                              {it.name}
                            </p>
                            <PriorityDot priority={it.priority} />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {it.quantity ? <span>{it.quantity}</span> : null}
                            {it.visibility === "private" ? (
                              <Chip>
                                <Lock className="h-3 w-3" /> Private
                              </Chip>
                            ) : null}
                            {it.visibility === "couple" ? (
                              <Chip>
                                <Heart className="h-3 w-3" /> Couple
                              </Chip>
                            ) : null}
                          </div>
                        </div>
                        {assignee ? (
                          <MemberAvatar
                            name={assignee.name}
                            color={assignee.color}
                            role={assignee.role}
                            size={24}
                            title={assignee.name}
                          />
                        ) : null}
                        {writable ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${it.name}`}
                            className="h-9 w-9 shrink-0 text-muted-foreground opacity-0 transition hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
                            onClick={() => void deleteItem(it)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* Footer bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/40 pt-3 dark:border-white/10">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{neededCount}</span> item
              {neededCount === 1 ? "" : "s"} to buy
            </p>
            <Button variant="outline" size="sm" onClick={() => setView("nearby")}>
              <Compass className="size-4" /> Find nearby stores
            </Button>
          </div>
        </GlassCard>
      )}

      {/* Add Item dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
            <DialogDescription>Add something to the family shopping list.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 scrollbar-slim">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="grocery-name">Name *</Label>
                <Input
                  id="grocery-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Organic milk"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grocery-quantity">Quantity</Label>
                <Input
                  id="grocery-quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="2 kg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="household">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" /> Household
                      </span>
                    </SelectItem>
                    <SelectItem value="private">
                      <span className="flex items-center gap-2">
                        <Lock className="h-4 w-4" /> Private
                      </span>
                    </SelectItem>
                    <SelectItem value="couple">
                      <span className="flex items-center gap-2">
                        <Heart className="h-4 w-4" /> Couple
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {visibility === "private" ? (
                  <p className="text-[11px] text-muted-foreground">
                    Private lists are only visible to you
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="brand-gradient border-0 text-white shadow-md"
              disabled={!canSubmit || saving}
              onClick={() => void submitItem()}
            >
              {saving ? "Adding…" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
