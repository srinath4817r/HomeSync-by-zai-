import { db } from "@/lib/db";

let seedPromise: Promise<void> | null = null;

/** Idempotent seed — creates the "Our Home" family + login accounts on first API call. */
export async function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((e) => {
      seedPromise = null;
      throw e;
    });
  }
  return seedPromise;
}

function at(dayOffset: number, hours: number, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function doSeed(): Promise<void> {
  const existing = await db.member.count();
  if (existing > 0) return;

  await db.member.createMany({
    data: [
      { name: "Karthik Rao", relation: "Me", role: "Family Admin", color: "#64748b", isAdmin: true, locationSharing: true, locationLabel: "Home • 24 Lakeview Avenue", locationUpdatedAt: new Date(Date.now() - 4 * 60000) },
      { name: "Meera Rao", relation: "Wife", role: "Parent", color: "#8f7a99", isAdmin: false, locationSharing: true, locationLabel: "Home • 24 Lakeview Avenue", locationUpdatedAt: new Date(Date.now() - 7 * 60000) },
      { name: "Aditya Rao", relation: "Son", role: "Child", color: "#6f9a80", isAdmin: false, locationSharing: true, locationLabel: "School • Lakeside Intl.", locationUpdatedAt: new Date(Date.now() - 35 * 60000) },
      { name: "Ananya Rao", relation: "Daughter", role: "Child", color: "#a89462", isAdmin: false, locationSharing: true, locationLabel: "School • Lakeside Intl.", locationUpdatedAt: new Date(Date.now() - 2 * 3600000) },
      { name: "Ramesh Rao", relation: "Dad", role: "Senior Member", color: "#6889a8", isAdmin: false, locationSharing: true, locationLabel: "Office • T. Nagar", locationUpdatedAt: new Date(Date.now() - 25 * 60000) },
      { name: "Lakshmi Rao", relation: "Mom", role: "Senior Member", color: "#a8836a", isAdmin: false, locationSharing: false, locationLabel: null, locationUpdatedAt: null },
    ],
  });
  const all = await db.member.findMany({ orderBy: { createdAt: "asc" } });
  const byRelation = (r: string) => all.find((m) => m.relation === r)!;
  const me = byRelation("Me");
  const wife = byRelation("Wife");
  const son = byRelation("Son");
  const daughter = byRelation("Daughter");
  const dad = byRelation("Dad");
  const mom = byRelation("Mom");

  // ---- Login accounts (one per role; email/password sign-in) ----
  await db.appUser.createMany({
    data: [
      { email: "karthik@homesync.app", password: "home@123", name: "Karthik Rao", role: "Family Admin", relation: "Me", color: "#64748b", memberId: me.id, provider: "local" },
      { email: "meera@homesync.app", password: "home@123", name: "Meera Rao", role: "Parent", relation: "Wife", color: "#8f7a99", memberId: wife.id, provider: "local" },
      { email: "aditya@homesync.app", password: "home@123", name: "Aditya Rao", role: "Child", relation: "Son", color: "#6f9a80", memberId: son.id, provider: "local" },
      { email: "ramesh@homesync.app", password: "home@123", name: "Ramesh Rao", role: "Senior Member", relation: "Dad", color: "#6889a8", memberId: dad.id, provider: "local" },
      // Google-linked accounts (Continue with Google)
      { email: "karthik.rao@gmail.com", password: "", name: "Karthik Rao", role: "Family Admin", relation: "Me", color: "#64748b", memberId: me.id, provider: "google" },
      { email: "meera.rao@gmail.com", password: "", name: "Meera Rao", role: "Parent", relation: "Wife", color: "#8f7a99", memberId: wife.id, provider: "google" },
    ],
  });

  // ---- Events (today + this week) ----
  await db.event.createMany({
    data: [
      { title: "Pick up prescription", startAt: at(0, 9, 30), endAt: at(0, 10, 0), type: "health", location: "Pharmacy – Anna Nagar", ownerId: me.id, note: "Mom's BP tablets" },
      { title: "School Drop – Ananya", startAt: at(0, 11, 0), endAt: at(0, 11, 30), type: "school", location: "Lakeside International School", ownerId: wife.id },
      { title: "Office", startAt: at(0, 13, 0), endAt: at(0, 18, 0), type: "work", location: "Tech Park, OMR", ownerId: me.id },
      { title: "Buy Groceries", startAt: at(0, 16, 0), endAt: at(0, 17, 0), type: "errand", location: "Fresh Mart", ownerId: wife.id },
      { title: "Family Dinner", startAt: at(0, 19, 0), endAt: at(0, 21, 0), type: "family", location: "Home", ownerId: me.id },
      { title: "Doctor Appointment – Mom", startAt: at(1, 10, 0), endAt: at(1, 11, 0), type: "health", location: "Apollo Clinic", ownerId: mom.id },
      { title: "Aditya – Football practice", startAt: at(2, 16, 0), endAt: at(2, 18, 0), type: "school", location: "School Grounds", ownerId: son.id },
      { title: "Electricity bill due", startAt: at(3, 9, 0), type: "bill", ownerId: me.id },
      { title: "Ananya – Dance class", startAt: at(4, 17, 0), endAt: at(4, 18, 0), type: "school", ownerId: daughter.id },
      { title: "Weekly family reset", startAt: at(6, 10, 0), endAt: at(6, 11, 0), type: "family", location: "Home", ownerId: me.id },
    ],
  });

  // ---- Tasks ----
  await db.task.createMany({
    data: [
      { title: "Pay electricity bill", assigneeId: me.id, dueAt: at(0, 20, 0), priority: "high", status: "pending", category: "Finance" },
      { title: "Water the plants", assigneeId: daughter.id, dueAt: at(0, 18, 0), priority: "low", status: "pending", category: "Home", recurring: "daily" },
      { title: "Refill Mom's medicines", assigneeId: wife.id, dueAt: at(1, 12, 0), priority: "high", status: "in_progress", category: "Care" },
      { title: "Book AC service", assigneeId: me.id, dueAt: at(4, 10, 0), priority: "medium", status: "pending", category: "Home" },
      { title: "Pack school lunch", assigneeId: wife.id, dueAt: at(0, 7, 0), priority: "medium", status: "done", category: "Home", recurring: "weekdays" },
      { title: "Clean the kitchen", assigneeId: son.id, dueAt: at(-1, 19, 0), priority: "medium", status: "done", category: "Home" },
    ],
  });

  // ---- Groceries ----
  await db.groceryItem.createMany({
    data: [
      { name: "Oat milk", quantity: "1 L", category: "Dairy", status: "needed", priority: "medium", assigneeId: wife.id },
      { name: "Tomatoes", quantity: "1 kg", category: "Vegetables", status: "needed", priority: "high", assigneeId: wife.id },
      { name: "Chicken", quantity: "500 g", category: "Meat", status: "needed", priority: "medium" },
      { name: "Detergent", quantity: "1 pack", category: "Household", status: "needed", priority: "low" },
      { name: "Rice", quantity: "5 kg", category: "Groceries", status: "needed", priority: "high", assigneeId: me.id },
      { name: "Milk", quantity: "2 packets", category: "Dairy", status: "needed", priority: "high" },
      { name: "Cooking oil", quantity: "1 L", category: "Groceries", status: "purchased", priority: "medium" },
      { name: "Bread", quantity: "1 loaf", category: "Groceries", status: "purchased", priority: "low" },
    ],
  });

  // ---- Medicines (today's doses with different states) ----
  await db.medicine.createMany({
    data: [
      { name: "Thyronorm", dosage: "1 tablet", timeLabel: "8:00 AM", instructions: "Before breakfast", memberId: mom.id, caregiverId: me.id, status: "taken", scheduledAt: at(0, 8, 0) },
      { name: "Amlodipine (BP)", dosage: "1 tablet", timeLabel: "9:00 AM", instructions: "After breakfast", memberId: dad.id, caregiverId: wife.id, status: "confirmation_pending", scheduledAt: at(0, 9, 0) },
      { name: "Metformin", dosage: "1 tablet", timeLabel: "1:00 PM", instructions: "After lunch", memberId: dad.id, caregiverId: me.id, status: "scheduled", scheduledAt: at(0, 13, 0) },
      { name: "Calcium + Vitamin D", dosage: "1 tablet", timeLabel: "9:00 PM", instructions: "After dinner", memberId: mom.id, caregiverId: wife.id, status: "scheduled", scheduledAt: at(0, 21, 0) },
      { name: "Iron supplement", dosage: "1 tablet", timeLabel: "8:00 PM", instructions: "With milk", memberId: wife.id, caregiverId: me.id, status: "scheduled", scheduledAt: at(0, 20, 0) },
    ],
  });

  // ---- Bills ----
  await db.bill.createMany({
    data: [
      { title: "Electricity – TNEB", category: "Electricity", amount: 1840, dueDate: at(3, 9, 0), status: "due", payerId: me.id, recurring: "monthly" },
      { title: "Internet – ACT Fibernet", category: "Internet", amount: 799, dueDate: at(6, 9, 0), status: "due", payerId: me.id, recurring: "monthly" },
      { title: "Water & Sewage", category: "Water", amount: 320, dueDate: at(9, 9, 0), status: "due", payerId: wife.id, recurring: "monthly" },
      { title: "Milk delivery – October", category: "Household", amount: 1350, dueDate: at(-6, 9, 0), status: "paid", payerId: wife.id, recurring: "monthly", paidAt: at(-6, 10, 0) },
      { title: "Gas cylinder", category: "Household", amount: 905, dueDate: at(-14, 9, 0), status: "paid", payerId: me.id, paidAt: at(-14, 11, 0) },
    ],
  });

  // ---- Documents ----
  await db.docItem.createMany({
    data: [
      { title: "Electricity bill – Sep.pdf", type: "bill", ownerName: "Karthik Rao", sizeLabel: "240 KB", visibility: "household" },
      { title: "AC warranty card.jpg", type: "warranty", ownerName: "Meera Rao", sizeLabel: "1.2 MB", visibility: "household" },
      { title: "Mom – prescription.pdf", type: "prescription", ownerName: "Karthik Rao", sizeLabel: "380 KB", visibility: "private" },
      { title: "Home insurance policy.pdf", type: "id", ownerName: "Karthik Rao", sizeLabel: "2.4 MB", visibility: "household" },
      { title: "Fridge service record.pdf", type: "manual", ownerName: "Ramesh Rao", sizeLabel: "540 KB", visibility: "household" },
      { title: "Aditya – school fee receipt.pdf", type: "receipt", ownerName: "Meera Rao", sizeLabel: "190 KB", visibility: "household" },
    ],
  });

  // ---- Home inventory ----
  await db.inventoryItem.createMany({
    data: [
      { name: "Rice", quantity: 5, unit: "kg", category: "Pantry", lowThreshold: 2 },
      { name: "Cooking oil", quantity: 1, unit: "L", category: "Pantry", lowThreshold: 1 },
      { name: "Gas cylinder", quantity: 1, unit: "pcs", category: "Kitchen", lowThreshold: 1 },
      { name: "Detergent", quantity: 2, unit: "pcs", category: "Cleaning", lowThreshold: 1 },
      { name: "Dish wash liquid", quantity: 0.5, unit: "bottle", category: "Cleaning", lowThreshold: 1 },
      { name: "Sugar", quantity: 2, unit: "kg", category: "Pantry", lowThreshold: 1 },
    ],
  });

  // ---- Nearby stores (catalog around Home • Lakeview Avenue, Chennai) ----
  const stores = [
    ["Fresh Mart", "supermarket", 0.3, 5, 4.5, 230, true, "12, Lakeview Road, Anna Nagar"],
    ["Super Market", "supermarket", 1.2, 8, 4.2, 410, true, "45, 2nd Avenue, Anna Nagar"],
    ["Local Grocery", "grocery", 1.5, 7, 4.0, 96, true, "8, Market Street"],
    ["Green Vegetables & Fruits", "grocery", 0.8, 6, 4.3, 150, true, "22, Vegetable Market Lane"],
    ["Sunrise Bakery", "cafe", 0.9, 6, 4.6, 320, true, "3, Bakery Cross Street"],
    ["Cafe Aroma", "cafe", 1.1, 7, 4.4, 210, true, "77, Main Road"],
    ["Anjappar Restaurant", "restaurant", 1.4, 9, 4.3, 890, true, "12, Food Street, Anna Nagar"],
    ["Biryani House", "restaurant", 2.0, 10, 4.5, 1200, true, "9, Biryani Lane"],
    ["Pizza Corner", "restaurant", 1.8, 9, 4.1, 640, false, "31, 3rd Avenue"],
    ["Apollo Pharmacy", "pharmacy", 0.6, 4, 4.7, 540, true, "5, Hospital Road"],
    ["MedPlus", "pharmacy", 1.3, 8, 4.4, 380, true, "18, Pharmacy Street"],
    ["Green Cross Chemist", "pharmacy", 2.1, 10, 4.0, 90, true, "40, Clinic Road"],
    ["Saravana Barber Shop", "barber", 1.0, 7, 4.4, 260, true, "14, Grooming Street"],
    ["Rockys Salon", "salon", 1.6, 8, 4.5, 310, true, "27, Style Avenue"],
    ["Glow Beauty Salon", "salon", 2.3, 11, 4.6, 420, false, "60, Beauty Road"],
    ["Kesari Stationery", "stationery", 1.7, 9, 4.2, 130, true, "2, School Road"],
    ["School Books & Copies", "stationery", 2.2, 10, 4.3, 170, true, "11, Book Street"],
    ["Sunrise Clinic", "clinic", 1.9, 9, 4.6, 450, true, "1, Health Avenue"],
    ["City Diagnostic Lab", "clinic", 2.6, 12, 4.4, 220, true, "23, Lab Road"],
    ["SK Hardware & Paints", "hardware", 2.4, 12, 4.1, 80, true, "33, Hardware Lane"],
    ["Prime Laundry", "laundry", 1.2, 8, 4.3, 140, true, "19, Wash Street"],
    ["Fruit Basket", "grocery", 0.5, 4, 4.5, 180, true, "7, Fruit Market"],
  ] as const;
  await db.store.createMany({
    data: stores.map((s) => ({
      name: s[0] as string,
      category: s[1] as string,
      distanceKm: s[2] as number,
      etaMins: s[3] as number,
      rating: s[4] as number,
      reviews: s[5] as number,
      openNow: s[6] as boolean,
      address: s[7] as string,
      phone: "+91 98XXX XXXXX",
    })),
  });

  // ---- Assistant welcome ----
  await db.assistantMessage.create({
    data: {
      role: "assistant",
      content:
        "Hello! I'm your HOME SYNC assistant. I can add tasks and groceries, create events and bill reminders, summarize your family's day, and find nearby services — try a command below.",
      action: null,
      actionStatus: null,
    },
  });

  // ---- Activity log ----
  await db.activityLog.createMany({
    data: [
      { actor: "Meera Rao", action: "purchased", target: "Cooking oil", createdAt: new Date(Date.now() - 20 * 60000) },
      { actor: "Karthik Rao", action: "completed task", target: "Pack school lunch", createdAt: new Date(Date.now() - 55 * 60000) },
      { actor: "Aditya Rao", action: "checked in at", target: "Lakeside International School", createdAt: new Date(Date.now() - 35 * 60000) },
      { actor: "Lakshmi Rao", action: "confirmed medicine", target: "Thyronorm 8:00 AM", createdAt: new Date(Date.now() - 90 * 60000) },
      { actor: "Karthik Rao", action: "added event", target: "Family Dinner", createdAt: new Date(Date.now() - 3 * 3600000) },
    ],
  });
}
