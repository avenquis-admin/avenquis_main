import { db, pool } from "./index";
import { users, firms, firmUsers, peopleProfiles } from "./schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function seed() {
  if (process.env.NODE_ENV !== "development") {
    console.error("Development seed is disabled unless NODE_ENV=development.");
    process.exit(1);
  }

  console.log("Seeding development data for B03...");
  try {
    const passwordHash = await bcrypt.hash("password123", 10);

    // Platform admin removed - Core is tenant only

    const [user1] = await db.insert(users).values({
      email: "user1@firm1.com",
      passwordHash,
    }).onConflictDoUpdate({ target: users.email, set: { email: "user1@firm1.com" } }).returning();

    const [user2] = await db.insert(users).values({
      email: "user2@firm2.com",
      passwordHash,
    }).onConflictDoUpdate({ target: users.email, set: { email: "user2@firm2.com" } }).returning();

    const [staff1] = await db.insert(users).values({
      email: "staff1@firm1.com",
      passwordHash,
    }).onConflictDoUpdate({ target: users.email, set: { email: "staff1@firm1.com" } }).returning();

    const [manager1] = await db.insert(users).values({
      email: "manager1@firm1.com",
      passwordHash,
    }).onConflictDoUpdate({ target: users.email, set: { email: "manager1@firm1.com" } }).returning();

    const [student1] = await db.insert(users).values({
      email: "student1@firm1.com",
      passwordHash,
    }).onConflictDoUpdate({ target: users.email, set: { email: "student1@firm1.com" } }).returning();

    // Create firms
    const [firm1] = await db.insert(firms).values({
      name: "Acme Audit Partners",
      subdomain: "acme",
    }).onConflictDoUpdate({ target: firms.subdomain, set: { name: "Acme Audit Partners" } }).returning();

    const [firm2] = await db.insert(firms).values({
      name: "Globex Tax Advisors",
      subdomain: "globex",
    }).onConflictDoUpdate({ target: firms.subdomain, set: { name: "Globex Tax Advisors" } }).returning();

    // Assign roles
    await db.insert(firmUsers).values([
      { userId: user1.id, firmId: firm1.id, role: "FIRM_OWNER" },
      { userId: user2.id, firmId: firm2.id, role: "PARTNER" },
      { userId: staff1.id, firmId: firm1.id, role: "STAFF" },
      { userId: manager1.id, firmId: firm1.id, role: "MANAGER" },
      { userId: student1.id, firmId: firm1.id, role: "ARTICLED_STUDENT" },
    ]).onConflictDoNothing();

    const profileSeeds = [
      { userId: user1.id, firmId: firm1.id, employeeCode: "P001", fullName: "Firm Owner", type: "PARTNER", designation: "Proprietor" },
      { userId: manager1.id, firmId: firm1.id, employeeCode: "M001", fullName: "Test Manager", type: "MANAGER", designation: "Audit Manager" },
      { userId: staff1.id, firmId: firm1.id, employeeCode: "S001", fullName: "Test Staff", type: "STAFF", designation: "Audit Staff" },
      { userId: student1.id, firmId: firm1.id, employeeCode: "AS001", fullName: "Test Articled Student", type: "ARTICLED_STUDENT", designation: "Articled Student" },
    ];
    for (const profile of profileSeeds) {
      const existing = await db.select().from(peopleProfiles).where(eq(peopleProfiles.userId, profile.userId));
      if (!existing.length) await db.insert(peopleProfiles).values(profile);
    }

    console.log("âœ… Development data seeded.");

    console.log(`Seeded Firm 1 (${firm1.name}) owner account: ${user1.email}`);
    console.log(`Seeded Firm 2 (${firm2.name}) partner account: ${user2.email}`);
    console.log(`Seeded Firm 1 manager account: ${manager1.email}`);
    console.log(`Seeded Firm 1 staff account: ${staff1.email}`);
    console.log(`Seeded Firm 1 student account: ${student1.email}`);
    process.exit(0);
  } catch (error) {
    console.error("âŒ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
