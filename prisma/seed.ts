/**
 * Seed script — safe to run multiple times (`npm run seed`).
 * Creates: default Super Admin, one account per role, a main branch with a
 * manager + rider assigned, sample catalog, and a few sample orders.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = "Admin12345@##";

type Role =
  | "super_admin" | "management" | "marketing" | "branch_manager" | "accounts" | "rider" | "customer";

// Each demo account gets a distinct BD mobile number: the login screen accepts
// a mobile number OR a username, and a phone must uniquely identify an account.
const SEED_USERS: { username: string; email: string; phone: string; firstName: string; lastName: string; role: Role; staff?: boolean }[] = [
  { username: "super_admin", email: "superadmin@example.com", phone: "01700000001", firstName: "Super Admin", lastName: "", role: "super_admin", staff: true },
  { username: "management", email: "management@example.com", phone: "01700000002", firstName: "Management", lastName: "", role: "management" },
  { username: "marketing", email: "marketing@example.com", phone: "01700000003", firstName: "Marketing", lastName: "", role: "marketing" },
  { username: "branch_manager", email: "branchmanager@example.com", phone: "01700000004", firstName: "Branch Manager", lastName: "", role: "branch_manager" },
  { username: "accounts", email: "accounts@example.com", phone: "01700000005", firstName: "Accounts", lastName: "", role: "accounts" },
  { username: "rider", email: "rider@example.com", phone: "01700000006", firstName: "Rider", lastName: "", role: "rider" },
  { username: "customer", email: "customer@example.com", phone: "01711111111", firstName: "Customer", lastName: "", role: "customer" },
];

const CATEGORIES = [
  { name: "Burgers", description: "Burger items." },
  { name: "Pizza", description: "Pizza items." },
  { name: "Drinks", description: "Cold drinks." },
];

// Brand tag + variation set per Main-branch (combined) product. Variations are
// re-derived on every seed run (delete+recreate), so the seed stays idempotent.
const PRODUCTS: {
  name: string;
  category: string;
  description: string;
  price: string;
  preparationTime: number;
  isPopular: boolean;
  isRecommended: boolean;
  brand: string;
  /** req #4 — crust policy: THICK | THIN | BOTH. */
  variationType: string;
  variations: { name: string; price: string; isDefault?: boolean }[];
}[] = [
  {
    name: "Classic Burger", category: "Burgers", description: "Juicy classic beef burger.",
    price: "299.00", preparationTime: 20, isPopular: true, isRecommended: true, brand: "madchef", variationType: "THICK",
    variations: [
      { name: "Single", price: "299.00", isDefault: true },
      { name: "Double", price: "399.00" },
    ],
  },
  {
    name: "Cheese Pizza", category: "Pizza", description: "Cheesy margherita pizza.",
    price: "499.00", preparationTime: 25, isPopular: true, isRecommended: false, brand: "cheez", variationType: "THICK",
    variations: [
      { name: "Small", price: "499.00" },
      { name: "Medium", price: "699.00", isDefault: true },
      { name: "Large", price: "899.00" },
    ],
  },
  {
    name: "Cold Drink", category: "Drinks", description: "Refreshing chilled drink.",
    price: "80.00", preparationTime: 5, isPopular: false, isRecommended: true, brand: "cheez", variationType: "THICK",
    variations: [
      { name: "Regular", price: "80.00", isDefault: true },
      { name: "Large", price: "120.00" },
    ],
  },
];

const BRANCH_NAME = "Main Branch";

/** Idempotently replace a product's variations with the given set. Exactly one
 * enabled default is guaranteed. Safe to run repeatedly (delete + recreate). */
async function seedVariations(
  productId: number,
  variations: { name: string; price: string; isDefault?: boolean }[],
): Promise<void> {
  await prisma.productVariation.deleteMany({ where: { productId } });
  const withDefault = variations.some((v) => v.isDefault) ? variations : variations.map((v, i) => ({ ...v, isDefault: i === 0 }));
  await prisma.productVariation.createMany({
    data: withDefault.map((v, i) => ({
      productId,
      name: v.name,
      price: new Prisma.Decimal(v.price),
      sortOrder: i,
      isDefault: Boolean(v.isDefault),
      isEnabled: true,
    })),
  });
  // Keep the product's base price mirroring its default variation.
  const def = withDefault.find((v) => v.isDefault) ?? withDefault[0];
  await prisma.product.update({ where: { id: productId }, data: { price: new Prisma.Decimal(def.price) } });
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // ── Default Super Admin (from ADMIN_* env) ──────────────────────────
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || SEED_PASSWORD;
  await prisma.user.upsert({
    where: { username: adminUsername },
    update: { role: "super_admin", status: "approved", isStaff: true, isSuperuser: true, isActive: true },
    create: {
      username: adminUsername,
      email: process.env.ADMIN_EMAIL || "admin@maddelivery.com",
      firstName: "MAD",
      lastName: "Super Admin",
      role: "super_admin",
      status: "approved",
      isStaff: true,
      isSuperuser: true,
      password: await bcrypt.hash(adminPassword, 10),
    },
  });
  console.log(`✔ Super Admin ready: ${adminUsername}`);

  // ── Role accounts ───────────────────────────────────────────────────
  const users: Record<string, { id: number }> = {};
  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        email: u.email, phone: u.phone, firstName: u.firstName, lastName: u.lastName, role: u.role,
        status: "approved", isActive: true, isStaff: Boolean(u.staff), isSuperuser: Boolean(u.staff),
        // Normalize the avatar to a clean baseline each run so shared demo users
        // never carry a stale upload reference from a prior test run (which would
        // 404 in the runtime-stability sweep). Avatar-upload tests use dedicated
        // fixture users below, so they never mutate these shared accounts.
        profilePhoto: null,
        password: passwordHash,
      },
      create: {
        username: u.username, email: u.email, phone: u.phone, firstName: u.firstName, lastName: u.lastName,
        role: u.role, status: "approved", isStaff: Boolean(u.staff), isSuperuser: Boolean(u.staff),
        password: passwordHash,
      },
    });
    users[u.role] = user;
    console.log(`✔ ${u.role}: ${u.username}`);
  }

  // Dedicated, isolated fixture users for the avatar-upload e2e specs. Keeping
  // these separate from the shared demo accounts makes those specs independent
  // of execution order — they mutate only their own user.
  const UPLOAD_FIXTURES = [
    { username: "qa_upload_1", email: "qa_upload_1@example.com", phone: "01799000001" },
    { username: "qa_upload_2", email: "qa_upload_2@example.com", phone: "01799000002" },
  ];
  for (const f of UPLOAD_FIXTURES) {
    await prisma.user.upsert({
      where: { username: f.username },
      update: { status: "approved", isActive: true, role: "customer", profilePhoto: null, password: passwordHash },
      create: {
        username: f.username, email: f.email, phone: f.phone, firstName: "QA", lastName: "Upload",
        role: "customer", status: "approved", isActive: true, password: passwordHash,
      },
    });
  }
  console.log(`✔ Upload fixtures: ${UPLOAD_FIXTURES.map((f) => f.username).join(", ")}`);

  // ── Branch ──────────────────────────────────────────────────────────
  let branch = await prisma.branch.findFirst({ where: { name: BRANCH_NAME } });
  branch = branch
    ? await prisma.branch.update({ where: { id: branch.id }, data: { address: "Dhaka, Bangladesh", phone: "01000000000", email: "branch@example.com", isActive: true, brandType: "combined" } })
    : await prisma.branch.create({ data: { name: BRANCH_NAME, address: "Dhaka, Bangladesh", phone: "01000000000", email: "branch@example.com", isActive: true, brandType: "combined" } });
  console.log(`✔ Branch: ${branch.name} (${branch.brandType})`);

  // ── Assign branch manager (history-preserving, idempotent) ─────────
  const manager = users["branch_manager"];
  const superAdmin = users["super_admin"];
  if (branch.managerId !== manager.id) {
    await prisma.branchManagerAssignment.updateMany({ where: { branchId: branch.id, relievedAt: null }, data: { relievedAt: new Date() } });
    await prisma.branch.update({ where: { id: branch.id }, data: { managerId: manager.id } });
    await prisma.branchManagerAssignment.create({
      data: { branchId: branch.id, managerId: manager.id, assignedById: superAdmin.id, notes: "Initial branch manager assignment." },
    });
    await prisma.managerActivityLog.create({
      data: { managerId: manager.id, branchId: branch.id, activityType: "action", description: `"${branch.name}" শাখায় নিযুক্ত হয়েছেন` },
    });
    console.log(`✔ Assigned manager: branch_manager → ${branch.name}`);
  }

  // ── Rider assignment ────────────────────────────────────────────────
  const rider = users["rider"];
  await prisma.riderProfile.upsert({
    where: { userId: rider.id },
    // Seed rider is online so demo order-assignment works out of the box
    // (an offline rider cannot be assigned new orders).
    update: { assignedBranchId: branch.id, vehicleType: "Bike", isOnline: true },
    create: { userId: rider.id, assignedBranchId: branch.id, vehicleType: "Bike", isOnline: true },
  });
  console.log(`✔ Rider assigned: rider → ${branch.name}`);

  // ── Catalog ─────────────────────────────────────────────────────────
  const catByName: Record<string, { id: number }> = {};
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { branchId: branch.id, name: c.name } });
    const cat = existing
      ? await prisma.category.update({ where: { id: existing.id }, data: { description: c.description, isActive: true } })
      : await prisma.category.create({ data: { branchId: branch.id, name: c.name, normalizedName: c.name.trim().toLowerCase(), description: c.description } });
    catByName[c.name] = cat;
  }
  for (const p of PRODUCTS) {
    const defaultPrice = p.variations.find((v) => v.isDefault)?.price ?? p.variations[0].price;
    const data = {
      branchId: branch.id,
      categoryId: catByName[p.category].id,
      description: p.description,
      brand: p.brand,
      price: new Prisma.Decimal(defaultPrice),
      discount: new Prisma.Decimal("0.00"),
      isAvailable: true,
      preparationTime: p.preparationTime,
      isPopular: p.isPopular,
      isRecommended: p.isRecommended,
      variationType: p.variationType,
    };
    const existing = await prisma.product.findFirst({ where: { branchId: branch.id, name: p.name } });
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data: { ...data, name: p.name } });
    await seedVariations(product.id, p.variations);
  }
  console.log(`✔ Catalog: ${CATEGORIES.length} categories, ${PRODUCTS.length} products (multi-variation)`);

  // ── Brand-scoped demo branches (single-brand: CHEEZ-only, MADCHEF-only) ──
  const brandBranches = [
    {
      name: "Cheez Gulshan", brand: "cheez", category: "Signature Pizzas",
      product: { name: "Pepperoni Pizza", description: "Loaded pepperoni.", variations: [{ name: "Medium", price: "650.00", isDefault: true }, { name: "Large", price: "850.00" }] },
    },
    {
      name: "Madchef Dhanmondi", brand: "madchef", category: "Rice Bowls",
      product: { name: "Beef Khichuri", description: "Comfort beef khichuri.", variations: [{ name: "Regular", price: "320.00", isDefault: true }, { name: "Family", price: "780.00" }] },
    },
  ];
  for (const b of brandBranches) {
    const existingB = await prisma.branch.findFirst({ where: { name: b.name } });
    // Give brand branches coordinates + a wide radius so delivery is orderable
    // (delivery now mandates valid coords + server coverage).
    const geo = { latitude: new Prisma.Decimal("23.7800000"), longitude: new Prisma.Decimal("90.4050000"), deliveryRadiusKm: new Prisma.Decimal("8.0"), pickupEnabled: true };
    const br = existingB
      ? await prisma.branch.update({ where: { id: existingB.id }, data: { brandType: b.brand, isActive: true, ...geo } })
      : await prisma.branch.create({ data: { name: b.name, address: "Dhaka, Bangladesh", phone: "01000000000", email: "branch@example.com", isActive: true, brandType: b.brand, ...geo } });
    const existingCat = await prisma.category.findFirst({ where: { branchId: br.id, name: b.category } });
    const cat = existingCat ?? (await prisma.category.create({ data: { branchId: br.id, name: b.category, normalizedName: b.category.trim().toLowerCase(), description: b.category } }));
    const defPrice = b.product.variations.find((v) => v.isDefault)?.price ?? b.product.variations[0].price;
    const existingP = await prisma.product.findFirst({ where: { branchId: br.id, name: b.product.name } });
    const prod = existingP
      ? await prisma.product.update({ where: { id: existingP.id }, data: { categoryId: cat.id, brand: b.brand, description: b.product.description, price: new Prisma.Decimal(defPrice), isAvailable: true } })
      : await prisma.product.create({ data: { branchId: br.id, categoryId: cat.id, name: b.product.name, brand: b.brand, description: b.product.description, price: new Prisma.Decimal(defPrice), isAvailable: true } });
    await seedVariations(prod.id, b.product.variations);
    console.log(`✔ Brand branch: ${br.name} (${br.brandType})`);
  }

  // ── Phase B demo data: coverage, prep time, pickup, tables, employees, attendance ──
  await prisma.branch.update({
    where: { id: branch.id },
    data: {
      latitude: new Prisma.Decimal("23.7808100"),
      longitude: new Prisma.Decimal("90.4079000"),
      deliveryRadiusKm: new Prisma.Decimal("5.0"),
      prepTimeMinutes: 30,
      pickupEnabled: true,
      pickupAddress: "Ground Floor, Main Branch, Dhaka",
      pickupPhone: "01000000000",
    },
  });
  // A named delivery zone (Gulshan-ish circle).
  const zoneName = "Gulshan Zone";
  const existingZone = await prisma.branchDeliveryZone.findFirst({ where: { branchId: branch.id, name: zoneName } });
  if (!existingZone) {
    await prisma.branchDeliveryZone.create({
      data: { branchId: branch.id, name: zoneName, centerLat: new Prisma.Decimal("23.7925000"), centerLng: new Prisma.Decimal("90.4078000"), radiusKm: new Prisma.Decimal("2.5"), deliveryFee: new Prisma.Decimal("40.00") },
    });
  }
  // Named delivery areas for the Main Branch (req #1/#6): one normal, one with a
  // higher charge/estimate, and one HELD (blocks new delivery orders) so the
  // checkout area selector + held-area block can be exercised end-to-end.
  const seedAreas = [
    { name: "Gulshan", charge: "40.00", minutes: 35, held: false, lat: "23.7925000", lng: "90.4078000" },
    { name: "Banani", charge: "60.00", minutes: 45, held: false, lat: "23.7936000", lng: "90.4066000" },
    { name: "Uttara", charge: "90.00", minutes: 70, held: true, reason: "Temporarily paused (rider shortage)", lat: null, lng: null },
  ];
  for (const a of seedAreas) {
    const normalizedName = a.name.trim().toLowerCase();
    const existingA = await prisma.branchDeliveryArea.findFirst({ where: { branchId: branch.id, normalizedName } });
    const data = {
      branchId: branch.id,
      name: a.name,
      normalizedName,
      isActive: true,
      isHeld: a.held,
      holdReason: a.held ? (a.reason ?? "") : "",
      estimatedDeliveryMinutes: a.minutes,
      deliveryCharge: new Prisma.Decimal(a.charge),
      centerLat: a.lat ? new Prisma.Decimal(a.lat) : null,
      centerLng: a.lng ? new Prisma.Decimal(a.lng) : null,
    };
    if (existingA) await prisma.branchDeliveryArea.update({ where: { id: existingA.id }, data });
    else await prisma.branchDeliveryArea.create({ data });
  }

  // Graphical tables.
  const seedTables = [
    { name: "T1", posX: 30, posY: 30, seats: 2 },
    { name: "T2", posX: 140, posY: 30, seats: 4 },
    { name: "T3", posX: 250, posY: 30, seats: 6 },
    { name: "T4", posX: 30, posY: 150, seats: 4, status: "out_of_service" },
  ];
  for (const tb of seedTables) {
    const existingT = await prisma.branchTable.findFirst({ where: { branchId: branch.id, name: tb.name } });
    if (!existingT) {
      await prisma.branchTable.create({ data: { branchId: branch.id, name: tb.name, posX: tb.posX, posY: tb.posY, seats: tb.seats, status: tb.status ?? "available" } });
    }
  }
  // Branch employees.
  const seedEmployees = [
    { code: "EMP-001", firstName: "Rahim", lastName: "Uddin", role: "chef", department: "Kitchen", phone: "01710000001" },
    { code: "EMP-002", firstName: "Karim", lastName: "Hossain", role: "waiter", department: "Floor", phone: "01710000002" },
    { code: "EMP-003", firstName: "Nadia", lastName: "Akter", role: "cashier", department: "Front", phone: "01710000003" },
    { code: "EMP-004", firstName: "Sohel", lastName: "Rana", role: "delivery", department: "Delivery", phone: "01710000004" },
  ];
  const empIds: number[] = [];
  for (const e of seedEmployees) {
    const existingE = await prisma.branchEmployee.findFirst({ where: { branchId: branch.id, employeeCode: e.code } });
    const emp = existingE
      ? await prisma.branchEmployee.update({ where: { id: existingE.id }, data: { role: e.role, department: e.department, phone: e.phone, isActive: true } })
      : await prisma.branchEmployee.create({ data: { branchId: branch.id, employeeCode: e.code, firstName: e.firstName, lastName: e.lastName, role: e.role, department: e.department, phone: e.phone, joiningDate: new Date("2025-01-15T00:00:00") } });
    empIds.push(emp.id);
  }
  // Today's attendance for a couple of employees (idempotent per employee/date).
  // UTC midnight so the stored date round-trips through toISOString().slice(0,10).
  const attDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const attPlan: [number, string][] = [[empIds[0], "present"], [empIds[1], "late"], [empIds[2], "leave"]];
  for (const [employeeId, status] of attPlan) {
    if (!employeeId) continue;
    await prisma.employeeAttendance.upsert({
      where: { employeeId_date: { employeeId, date: attDate } },
      update: { status, recordedById: manager.id },
      create: { employeeId, branchId: branch.id, date: attDate, status, recordedById: manager.id },
    });
  }
  console.log(`✔ Phase B demo: ${seedTables.length} tables, ${seedEmployees.length} employees, zone + attendance`);

  // Baseline hygiene: clear any leftover in-progress deliveries on the demo
  // rider so duty state is deterministic (a rider with an active delivery
  // cannot go offline — Part C). Historical delivered orders are untouched.
  await prisma.order.updateMany({
    where: { riderId: rider.id, status: { in: ["accepted", "preparing", "ready", "picked_up", "on_the_way"] } },
    data: { status: "cancelled" },
  });

  // ── Part C demo: rider active duty session at Main (so BM can assign) + an
  // ended session for duty history. Idempotent.
  let session = await prisma.riderBranchDutySession.findFirst({ where: { riderId: rider.id, status: "active" } });
  if (!session) {
    session = await prisma.riderBranchDutySession.create({ data: { riderId: rider.id, branchId: branch.id, status: "active" } });
  } else if (session.branchId !== branch.id) {
    session = await prisma.riderBranchDutySession.update({ where: { id: session.id }, data: { branchId: branch.id } });
  }
  const dutyThread = await prisma.riderDutyChatThread.findUnique({ where: { sessionId: session.id } });
  if (!dutyThread) {
    await prisma.riderDutyChatThread.create({ data: { sessionId: session.id, riderId: rider.id, branchId: branch.id } });
  }
  await prisma.riderProfile.update({ where: { userId: rider.id }, data: { isOnline: true } });
  // One ended session (history) at a brand branch, if not already present.
  const brandBranchForHistory = await prisma.branch.findFirst({ where: { name: "Cheez Gulshan" } });
  if (brandBranchForHistory) {
    const endedExists = await prisma.riderBranchDutySession.findFirst({ where: { riderId: rider.id, branchId: brandBranchForHistory.id, status: "ended" } });
    if (!endedExists) {
      await prisma.riderBranchDutySession.create({
        data: { riderId: rider.id, branchId: brandBranchForHistory.id, status: "ended", endedAt: new Date(), endReason: "switch" },
      });
    }
  }
  // A second approved rider (offline, no session) for cross-rider permission
  // tests. Named "courier2" (no "rider" substring) so it doesn't pollute
  // rider-name searches. Remove any legacy "rider2" account from earlier runs.
  await prisma.user.deleteMany({ where: { username: "rider2" } });
  const rider2 = await prisma.user.upsert({
    where: { username: "courier2" },
    update: { role: "rider", status: "approved", isActive: true, password: passwordHash },
    create: { username: "courier2", email: "courier2@example.com", phone: "01799000010", firstName: "Backup", lastName: "Courier", role: "rider", status: "approved", isActive: true, password: passwordHash },
  });
  await prisma.riderProfile.upsert({
    where: { userId: rider2.id },
    update: { isOnline: false },
    create: { userId: rider2.id, vehicleType: "Bike", isOnline: false },
  });
  console.log(`✔ Part C demo: rider active duty session at ${branch.name} + history + courier2`);

  // ── Ramadan demo (B7/B8/B9): config, slots, platters. Dates derived from the
  // current date (no hardcoded Ramadan year). Idempotent.
  // Clear accumulated test bookings (none are real/demo) so date/table windows
  // are free each run (payments cascade). This keeps the suite deterministic.
  await prisma.ramadanReservation.deleteMany({});
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const rangeEnd = new Date(today.getTime() + 45 * 86400000);
  await prisma.ramadanConfig.upsert({
    where: { branchId: branch.id },
    update: { isEnabled: true, bookingStartDate: today, bookingEndDate: rangeEnd, advanceType: "percent", advanceValue: new Prisma.Decimal("20"), advanceGuestThreshold: 4, paymentDeadlineHours: 24 },
    create: { branchId: branch.id, isEnabled: true, bookingStartDate: today, bookingEndDate: rangeEnd, advanceType: "percent", advanceValue: new Prisma.Decimal("20"), advanceGuestThreshold: 4, paymentDeadlineHours: 24 },
  });
  const ramSlots = [
    { label: "Iftar — 6:15 PM", startTime: "18:15", endTime: "19:30", capacity: 20 },
    { label: "Iftar — 6:45 PM", startTime: "18:45", endTime: "20:00", capacity: 20 },
  ];
  for (const sl of ramSlots) {
    const existing = await prisma.ramadanTimeSlot.findFirst({ where: { branchId: branch.id, label: sl.label } });
    if (!existing) await prisma.ramadanTimeSlot.create({ data: { branchId: branch.id, ...sl } });
  }
  const ramMenus = [
    { name: "Family Iftar Platter", price: "1200.00", servingCapacity: 4, items: ["Dates & Sharbat", "Piyaju & Beguni", "Haleem", "Jilapi", "Biryani (serves 4)"] },
    { name: "Grand Iftar Set", price: "2000.00", servingCapacity: 6, items: ["Dates & Rooh Afza", "Assorted Fritters", "Beef Haleem", "Chicken Roast", "Kacchi Biryani (serves 6)", "Firni"] },
  ];
  for (const mn of ramMenus) {
    const existing = await prisma.ramadanMenu.findFirst({ where: { branchId: branch.id, name: mn.name } });
    if (!existing) {
      await prisma.ramadanMenu.create({
        data: {
          branchId: branch.id, name: mn.name, price: new Prisma.Decimal(mn.price), servingCapacity: mn.servingCapacity,
          startDate: today, endDate: rangeEnd, isActive: true,
          items: { create: mn.items.map((n, i) => ({ name: n, sortOrder: i })) },
        },
      });
    }
  }
  console.log(`✔ Ramadan demo: config + ${ramSlots.length} slots + ${ramMenus.length} platters`);

  // ── Sample orders (only if the customer has none) ───────────────────
  const customer = users["customer"];
  const hasOrders = await prisma.order.findFirst({ where: { customerId: customer.id } });
  if (!hasOrders) {
    const products = await prisma.product.findMany({ where: { branchId: branch.id }, orderBy: { id: "asc" } });
    if (products.length) {
      const plan: { status: string; payment: string; riderId: number | null; lines: [number, number][] }[] = [
        { status: "delivered", payment: "cash", riderId: rider.id, lines: [[0, 2], [2, 1]] },
        { status: "delivered", payment: "bkash", riderId: rider.id, lines: [[1, 1]] },
        { status: "preparing", payment: "cash", riderId: null, lines: [[0, 1], [1, 1]] },
        { status: "pending", payment: "bkash", riderId: null, lines: [[2, 3]] },
      ];
      for (const o of plan) {
        let total = new Prisma.Decimal(0);
        // #15 — unique order number (ORD-YYYYMMDD-000001) via the per-day counter.
        const now = new Date();
        const dateKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
        const counter = await prisma.orderNumberCounter.upsert({
          where: { dateKey },
          create: { dateKey, seq: 1 },
          update: { seq: { increment: 1 } },
        });
        const orderNumber = `ORD-${dateKey}-${String(counter.seq).padStart(6, "0")}`;
        const order = await prisma.order.create({
          data: {
            orderNumber,
            customerId: customer.id, branchId: branch.id, riderId: o.riderId, status: o.status,
            paymentMethod: o.payment, deliveryAddress: "Dhaka, Bangladesh", foodNotes: "",
          },
        });
        for (const [idx, qty] of o.lines) {
          const product = products[idx % products.length];
          await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, quantity: qty, unitPrice: product.price } });
          total = total.plus(product.price.mul(qty));
        }
        await prisma.order.update({ where: { id: order.id }, data: { totalAmount: total } });
      }
      console.log(`✔ Created ${plan.length} sample orders`);
    }
  } else {
    console.log("• Sample orders already exist — skipped");
  }

  // ── Money flow: commission setting, commissions, withdrawals ────────
  const COMMISSION_RATE = "50.00";
  await prisma.systemSetting.upsert({
    where: { key: "rider_commission_per_delivery" },
    update: {},
    create: { key: "rider_commission_per_delivery", value: COMMISSION_RATE, updatedById: superAdmin.id },
  });
  console.log(`✔ Commission setting: ৳${COMMISSION_RATE}/delivery`);

  // Backfill commission rows for delivered rider-assigned orders (unique orderId = idempotent).
  const deliveredOrders = await prisma.order.findMany({
    where: { status: "delivered", riderId: { not: null }, commission: null },
    select: { id: true, riderId: true, branchId: true },
  });
  for (const o of deliveredOrders) {
    await prisma.riderCommission.create({
      data: { riderId: o.riderId!, orderId: o.id, branchId: o.branchId, amount: new Prisma.Decimal(COMMISSION_RATE) },
    });
  }
  if (deliveredOrders.length) console.log(`✔ Backfilled ${deliveredOrders.length} commission rows`);

  const hasWithdrawals = await prisma.riderWithdrawal.findFirst();
  if (!hasWithdrawals) {
    // One paid (already deducted) + one pending withdrawal for the demo rider.
    await prisma.riderWithdrawal.create({
      data: {
        riderId: rider.id,
        amount: new Prisma.Decimal("30.00"),
        status: "paid",
        note: "বিকাশ: 01700000000",
        decidedById: users["accounts"].id,
        decidedAt: new Date(),
        paidAt: new Date(),
      },
    });
    await prisma.riderWithdrawal.create({
      data: { riderId: rider.id, amount: new Prisma.Decimal("20.00"), status: "pending", note: "বিকাশ: 01700000000" },
    });
    await prisma.financialAuditLog.createMany({
      data: [
        { actorId: rider.id, action: "withdrawal_requested", entity: "RiderWithdrawal", entityId: "1", detail: "৳30.00" },
        { actorId: users["accounts"].id, action: "withdrawal_paid", entity: "RiderWithdrawal", entityId: "1", detail: "৳30.00" },
        { actorId: rider.id, action: "withdrawal_requested", entity: "RiderWithdrawal", entityId: "2", detail: "৳20.00" },
      ],
    });
    console.log("✔ Seeded withdrawals: 1 paid, 1 pending");
  } else {
    console.log("• Withdrawals already exist — skipped");
  }

  // ── Blocked demo customer (super-admin controls) ─────────────────────
  await prisma.user.upsert({
    where: { username: "blocked_customer" },
    update: {},
    create: {
      username: "blocked_customer",
      email: "blocked@example.com",
      firstName: "Blocked",
      lastName: "Customer",
      role: "customer",
      status: "approved",
      isBlocked: true,
      blockedReason: "ভুয়া অর্ডার দেওয়ার কারণে ব্লক করা হয়েছে",
      password: passwordHash,
    },
  });
  console.log("✔ Blocked demo customer");

  // ── Customer core: addresses, reward rules/ledger, reviews ──────────
  const REWARD_RULES: { key: string; coins: number }[] = [
    { key: "profile_complete", coins: 50 },
    { key: "daily_login", coins: 5 },
    { key: "order_delivered", coins: 10 },
  ];
  for (const r of REWARD_RULES) {
    await prisma.rewardRule.upsert({ where: { key: r.key }, update: {}, create: { key: r.key, coins: r.coins } });
  }
  await prisma.systemSetting.upsert({
    where: { key: "reward_coin_value_tk" },
    update: {},
    create: { key: "reward_coin_value_tk", value: "0.50", updatedById: superAdmin.id },
  });
  await prisma.systemSetting.upsert({
    where: { key: "reward_min_redeem_coins" },
    update: {},
    create: { key: "reward_min_redeem_coins", value: "100", updatedById: superAdmin.id },
  });
  console.log("✔ Reward rules + coin value");

  if (!(await prisma.customerAddress.findFirst({ where: { userId: customer.id } }))) {
    await prisma.customerAddress.create({
      data: { userId: customer.id, label: "বাসা", address: "House 12, Road 5, Dhanmondi, Dhaka", isDefault: true },
    });
    await prisma.customerAddress.create({
      data: { userId: customer.id, label: "অফিস", address: "Level 4, Gulshan Avenue, Dhaka", isDefault: false },
    });
    console.log("✔ Seeded 2 customer addresses");
  }

  // Reward ledger backfill for delivered orders (idempotent via dedupeKey).
  const customerDelivered = await prisma.order.findMany({
    where: { customerId: customer.id, status: "delivered" },
    select: { id: true },
  });
  for (const o of customerDelivered) {
    await prisma.rewardLedger.upsert({
      where: { userId_reason_dedupeKey: { userId: customer.id, reason: "order_delivered", dedupeKey: `order:${o.id}` } },
      update: {},
      create: { userId: customer.id, coins: 10, reason: "order_delivered", dedupeKey: `order:${o.id}` },
    });
  }

  // Sample reviews on the first delivered rider order (idempotent).
  const reviewable = await prisma.order.findFirst({
    where: { customerId: customer.id, status: "delivered", riderId: { not: null } },
    include: { items: true },
    orderBy: { id: "asc" },
  });
  if (reviewable && !(await prisma.riderReview.findUnique({ where: { orderId: reviewable.id } }))) {
    await prisma.riderReview.create({
      data: {
        orderId: reviewable.id,
        customerId: customer.id,
        riderId: reviewable.riderId!,
        rating: 5,
        comment: "খুব দ্রুত ডেলিভারি পেয়েছি!",
      },
    });
    if (reviewable.items[0]) {
      await prisma.foodReview.create({
        data: {
          orderId: reviewable.id,
          productId: reviewable.items[0].productId,
          customerId: customer.id,
          rating: 4,
          comment: "খাবার সুস্বাদু ছিল।",
        },
      });
    }
    console.log("✔ Seeded sample rider + food reviews");
  }

  // ── Marketing: coupons + campaign + segment (idempotent) ────────────
  const marketing = users["marketing"];
  const eid = await prisma.coupon.upsert({
    where: { code: "EID50" },
    update: {},
    create: {
      code: "EID50",
      discountType: "fixed",
      value: new Prisma.Decimal("50.00"),
      minOrder: new Prisma.Decimal("300.00"),
      maxUses: 100,
      isActive: true,
      createdById: marketing.id,
    },
  });
  await prisma.coupon.upsert({
    where: { code: "SAVE10" },
    update: {},
    create: {
      code: "SAVE10",
      discountType: "percent",
      value: new Prisma.Decimal("10.00"),
      minOrder: new Prisma.Decimal("0.00"),
      isActive: true,
      createdById: marketing.id,
    },
  });
  if (!(await prisma.campaign.findFirst())) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    await prisma.campaign.create({
      data: {
        title: "ঈদ স্পেশাল অফার",
        description: "ঈদ উপলক্ষে ৳৩০০+ অর্ডারে ৳৫০ ছাড়।",
        type: "offer",
        startsAt: start,
        endsAt: end,
        couponId: eid.id,
        createdById: marketing.id,
      },
    });
    console.log("✔ Seeded 2 coupons + 1 campaign");
  }
  if (!(await prisma.audienceSegment.findFirst())) {
    await prisma.audienceSegment.create({
      data: {
        name: "ঢাকার সক্রিয় গ্রাহক",
        criteria: JSON.stringify({ location: "Dhaka", min_orders: 1 }),
        createdById: marketing.id,
      },
    });
    console.log("✔ Seeded 1 audience segment");
  }

  // ── Complaints, notices & notifications (idempotent) ────────────────
  const hasComplaints = await prisma.complaint.findFirst();
  if (!hasComplaints) {
    const firstOrder = await prisma.order.findFirst({ where: { customerId: customer.id } });
    const c1 = await prisma.complaint.create({
      data: {
        complainantId: customer.id,
        recipientRole: "branch_manager",
        branchId: branch.id,
        orderId: firstOrder?.id ?? null,
        category: "food_quality",
        subject: "খাবার ঠান্ডা ছিল",
        message: "আমার অর্ডারের খাবার ঠান্ডা অবস্থায় পৌঁছেছে। অনুগ্রহ করে বিষয়টি দেখুন।",
        status: "in_progress",
        assignedToId: manager.id,
      },
    });
    await prisma.complaintMessage.create({
      data: { complaintId: c1.id, senderId: manager.id, body: "দুঃখিত! আমরা বিষয়টি খতিয়ে দেখছি এবং দ্রুত সমাধান করব।" },
    });
    await prisma.complaint.create({
      data: {
        complainantId: rider.id,
        recipientRole: "accounts",
        category: "payment",
        subject: "কমিশন পেমেন্ট বিলম্ব",
        message: "গত সপ্তাহের ডেলিভারি কমিশন এখনও যোগ হয়নি।",
        status: "pending",
      },
    });

    // Every role, referenced by role key, so demo notifications reach all inboxes.
    const management = users["management"];
    const accounts = users["accounts"];

    // A broadcast notice to everyone — fanned out to all seven roles.
    const noticeTargets = [superAdmin, management, marketing, manager, accounts, rider, customer];
    const notice = await prisma.notice.create({
      data: {
        authorId: superAdmin.id,
        title: "ঈদ উপলক্ষে বিশেষ অফার",
        body: "আগামী সপ্তাহে সকল শাখায় বিশেষ ছাড় থাকছে।",
        audience: "all",
        type: "notice",
        recipients: noticeTargets.length,
      },
    });

    // System-generated notifications use i18n keys (render in EN or BN); the
    // notice fan-out carries the admin-written notice text verbatim (user
    // content). Mix of unread + read + action-link so every demo inbox is real.
    await prisma.notification.createMany({
      data: [
        // Notice → every role (some already read to demo read-state styling).
        ...noticeTargets.map((u, i) => ({
          userId: u.id,
          type: "notice",
          title: notice.title,
          body: notice.body,
          noticeId: notice.id,
          link: null,
          isRead: i % 3 === 0, // a couple pre-read
        })),

        // Super Admin — financial oversight (unread, action link).
        { userId: superAdmin.id, type: "payment", titleKey: "notifications.refund.recorded.title", bodyKey: "notifications.refund.recorded.body", params: { id: 1, amount: "120.00" }, link: "/admin/orders/1" },

        // Management — a new order landed at a branch.
        { userId: management.id, type: "order", titleKey: "notifications.order.newOrder.title", bodyKey: "notifications.order.newOrder.body", params: { id: 1 }, link: "/management/orders" },

        // Marketing — a campaign was sent.
        { userId: marketing.id, type: "marketing", titleKey: "notifications.marketing.sent.title", bodyKey: "notifications.marketing.sent.body", params: { name: "Eid Offer", count: 1240 }, link: "/marketing/campaigns" },

        // Branch Manager — new complaint (raw subject) + new order.
        { userId: manager.id, type: "complaint", titleKey: "notifications.complaint.new.title", body: c1.subject, link: `/branch-manager/complaints/${c1.id}` },
        { userId: manager.id, type: "order", titleKey: "notifications.order.newOrder.title", bodyKey: "notifications.order.newOrder.body", params: { id: 1 }, link: "/branch-manager/orders" },

        // Accounts — a rider requested a withdrawal.
        { userId: accounts.id, type: "withdrawal", titleKey: "notifications.withdrawal.requested.title", bodyKey: "notifications.withdrawal.requested.body", params: { name: "Rider", amount: "500.00" }, link: "/accounts/withdrawals" },

        // Rider — commission added (unread) + withdrawal approved (read).
        { userId: rider.id, type: "commission", titleKey: "notifications.commission.added.title", bodyKey: "notifications.commission.added.body", params: { id: 1, amount: "50.00" }, link: "/rider/wallet" },
        { userId: rider.id, type: "withdrawal", titleKey: "notifications.withdrawal.approved.title", bodyKey: "notifications.withdrawal.approved.body", params: { amount: "500.00" }, link: "/rider/withdrawals", isRead: true },

        // Customer — order update (unread) + coins earned + order placed.
        { userId: customer.id, type: "order", titleKey: "notifications.order.update.title", bodyKey: "notifications.order.update.body", link: "/customer/orders" },
        { userId: customer.id, type: "reward", titleKey: "notifications.reward.earned.title", bodyKey: "notifications.reward.earned.body", params: { coins: 20 }, link: "/customer/rewards" },
      ],
    });
    console.log("✔ Seeded complaints, 1 notice, notifications for every role");
  } else {
    console.log("• Complaints already exist — skipped");
  }

  // ── Branch manager extras: hours, reservation, ramadan (idempotent) ──
  if (!(await prisma.deliveryTimeSlot.findFirst({ where: { branchId: branch.id } }))) {
    await prisma.deliveryTimeSlot.createMany({
      data: [
        { branchId: branch.id, label: "দুপুর", startTime: "12:00", endTime: "15:00" },
        { branchId: branch.id, label: "রাত", startTime: "19:00", endTime: "23:00" },
      ],
    });
    // Hours are left UNSET on the seeded branch on purpose. Server-side hours
    // enforcement (lib/services/branch-hours.ts) treats a branch with no
    // openingTime/closingTime as always orderable, so the e2e suite — which
    // orders from the seeded/created branches at whatever wall-clock CI runs —
    // stays deterministic regardless of the Dhaka time of day. Tests that need a
    // genuinely open-or-closed branch seed their own hours relative to now
    // (see tests/e2e/57-branch-hours-enforcement.spec.ts).
    await prisma.branch.update({ where: { id: branch.id }, data: { openingTime: null, closingTime: null } });
    console.log("✔ Seeded 2 delivery time slots (branch hours left unset for deterministic ordering)");
  }
  if (!(await prisma.tableReservation.findFirst())) {
    const res = await prisma.tableReservation.create({
      data: {
        branchId: branch.id,
        customerId: customer.id,
        guestName: "Customer",
        guestPhone: "01700000000",
        partySize: 4,
        requestedAt: new Date(Date.now() + 86400000),
        note: "জানালার পাশে টেবিল চাই।",
      },
    });
    await prisma.reservationMessage.create({
      data: { reservationId: res.id, senderId: manager.id, body: "আপনার রিজার্ভেশন পেয়েছি, নিশ্চিত করছি।" },
    });
    console.log("✔ Seeded 1 table reservation");
  }
  if (!(await prisma.ramadanTable.findFirst({ where: { branchId: branch.id } }))) {
    const rtable = await prisma.ramadanTable.create({
      data: { branchId: branch.id, name: "টেবিল ১", capacity: 6 },
    });
    await prisma.ramadanTable.create({ data: { branchId: branch.id, name: "টেবিল ২", capacity: 4 } });
    await prisma.ramadanBooking.create({
      data: {
        tableId: rtable.id,
        branchId: branch.id,
        customerId: customer.id,
        guestName: "Customer",
        guestPhone: "01700000000",
        partySize: 5,
        bookingDate: new Date(new Date().getFullYear(), 2, 15),
      },
    });
    console.log("✔ Seeded 2 ramadan tables + 1 booking");
  }
  // Sample attendance for branch manager (today).
  await prisma.staffAttendance.upsert({
    where: { userId_date: { userId: manager.id, date: new Date(new Date().setHours(0, 0, 0, 0)) } },
    update: {},
    create: {
      userId: manager.id,
      branchId: branch.id,
      date: new Date(new Date().setHours(0, 0, 0, 0)),
      status: "present",
    },
  });

  // ── Rider location trail + login history (idempotent) ────────────────
  if (!(await prisma.riderRoutePoint.findFirst({ where: { riderId: rider.id } }))) {
    const base = [23.8103, 90.4125];
    const trail = Array.from({ length: 6 }, (_, i) => ({
      riderId: rider.id,
      lat: new Prisma.Decimal((base[0] + i * 0.002).toFixed(7)),
      lng: new Prisma.Decimal((base[1] + i * 0.0015).toFixed(7)),
    }));
    await prisma.riderRoutePoint.createMany({ data: trail });
    await prisma.riderProfile.update({
      where: { userId: rider.id },
      data: {
        isOnline: true,
        currentLat: new Prisma.Decimal((base[0] + 0.01).toFixed(7)),
        currentLng: new Prisma.Decimal((base[1] + 0.0075).toFixed(7)),
        lastPingAt: new Date(),
      },
    });
    console.log("✔ Seeded rider route trail (6 points)");
  }
  if (!(await prisma.loginHistory.findFirst({ where: { userId: rider.id } }))) {
    await prisma.loginHistory.createMany({
      data: [
        { userId: rider.id, ipAddress: "127.0.0.1" },
        { userId: manager.id, ipAddress: "127.0.0.1" },
      ],
    });
    console.log("✔ Seeded login history");
  }

  console.log("\nSeed accounts ready. Password for all: " + SEED_PASSWORD);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
