// HOME SYNC — shared types (authoritative contract for frontend + API)

export type ViewKey =
  | "overview"
  | "calendar"
  | "tasks"
  | "groceries"
  | "care"
  | "map"
  | "nearby"
  | "members"
  | "bills"
  | "documents"
  | "inventory"
  | "assistant"
  | "settings";

export interface Member {
  id: string;
  name: string;
  relation: string; // "Me", "Wife", "Son", "Daughter", "Dad", "Mom"
  role: string; // "Family Admin", "Parent", "Senior Member", "Child", ...
  color: string; // hex for avatar background
  isAdmin: boolean;
  locationSharing: boolean;
  locationLabel: string | null; // "Office • T. Nagar"
  locationUpdatedAt: string | null; // ISO
  createdAt: string;
}

export type TaskStatus = "pending" | "in_progress" | "done";
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueAt: string | null; // ISO
  priority: string; // low | medium | high
  status: string; // pending | in_progress | done
  category: string | null;
  recurring: string | null;
  createdAt: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  category: string; // Dairy | Vegetables | Meat | Household | Groceries | Other
  status: string; // needed | purchased | skipped
  priority: string;
  note: string | null;
  assigneeId: string | null;
  visibility: string; // household | private | couple
  createdAt: string;
}

export type MedicineStatus =
  | "scheduled"
  | "taken"
  | "skipped"
  | "confirmation_pending"
  | "escalated"
  | "acknowledged";

export interface Medicine {
  id: string;
  name: string;
  dosage: string;
  timeLabel: string; // "8:00 AM"
  instructions: string | null;
  memberId: string;
  caregiverId: string | null;
  status: string; // MedicineStatus
  escalatedToId: string | null;
  scheduledAt: string; // ISO
  createdAt: string;
}

export type EventTypeKey =
  | "personal"
  | "family"
  | "school"
  | "work"
  | "health"
  | "errand"
  | "bill";

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string; // ISO
  endAt: string | null;
  type: string; // EventTypeKey
  location: string | null;
  ownerId: string | null;
  note: string | null;
  createdAt: string;
}

export interface Bill {
  id: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  dueDate: string; // ISO
  status: string; // due | paid
  payerId: string | null;
  recurring: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface DocItem {
  id: string;
  title: string;
  type: string; // receipt | warranty | prescription | bill | id | manual | other
  ownerName: string;
  sizeLabel: string;
  visibility: string; // household | private
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  lowThreshold: number;
  updatedAt: string;
}

export interface NearbyStore {
  id: string;
  name: string;
  category: string; // grocery | supermarket | restaurant | cafe | pharmacy | barber | salon | stationery | clinic | hardware | laundry
  distanceKm: number;
  etaMins: number;
  rating: number;
  reviews: number;
  openNow: boolean | null; // null = unknown
  address: string;
  phone: string | null;
}

export interface StoreCategory {
  key: string;
  label: string;
  count: number;
}

export interface ActivityEntry {
  id: string;
  actor: string;
  action: string; // "completed task", "marked bill paid", ...
  target: string;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  role: string; // "user" | "assistant"
  content: string;
  actions: ProposedAction[]; // all proposed actions for this message (batch)
  actionStatus: "proposed" | "accepted" | "declined" | null;
  createdAt: string;
}

export type ProposedAction =
  | { kind: "add_task"; title: string; assigneeName?: string; time?: string; recurring?: string }
  | { kind: "add_grocery"; name: string; quantity?: string; category?: string }
  | { kind: "add_event"; title: string; date?: string; time?: string; location?: string }
  | { kind: "add_bill"; title: string; amount?: number; dueDate?: string }
  | { kind: "none" };

export interface DashboardStats {
  todayEvents: number;
  nextEventLabel: string; // "Next at 9:30 AM" or "No more events today"
  tasksPending: number;
  groceryToBuy: number;
  medicinesToday: number;
  billsDue: number;
  checkIns: number; // members with location sharing on
  membersTotal: number;
}

export type WeatherIconKey = "sunny" | "partly" | "cloudy" | "rain" | "storm";

export interface WeatherData {
  city: string;
  tempC: number;
  condition: string;
  icon: WeatherIconKey;
  forecast: { day: string; highC: number; lowC: number; icon: WeatherIconKey }[];
  demo: boolean;
}

export interface DashboardResponse {
  stats: DashboardStats;
  todayEvents: CalendarEvent[];
  activity: ActivityEntry[];
  members: Member[];
}

/**
 * Real-world map pin (rendered on the satellite Leaflet map).
 * lat/lng are actual coordinates around Green Park, Chennai.
 */
export interface MapPin {
  id: string;
  kind: "member" | "place";
  label: string;
  sublabel?: string;
  color: string; // accent color (hex)
  initials?: string; // for member pins
  lat: number;
  lng: number;
  stale?: boolean;
  sharing?: boolean;
}

/** Saved places on the family map (real coordinates). */
export interface SavedPlace {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  lat: number;
  lng: number;
}

/** Signed-in session user (from login API, Google sign-in, or guest mode). */
export interface SessionUser {
  id: string;
  name: string;
  email: string | null; // null for guest
  role: string; // "Family Admin" | "Parent" | "Senior Member" | "Child" | "Guest"
  relation: string; // "Me" | "Wife" | ... | "Guest"
  color: string;
  photoUrl: string | null; // real Google profile photo when available
  memberId: string | null;
  isGuest: boolean;
  provider: string; // "local" | "google" | "guest"
  profileLocked: boolean; // true once the Family Admin has edited this profile
}
