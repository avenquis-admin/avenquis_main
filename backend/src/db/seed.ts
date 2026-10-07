import { db, pool } from "./index";
import { users, firms, firmUsers, peopleProfiles } from "./schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function seed() {
  if (process.env.NODE_ENV !== "development") {
    console.error("Development seed is disabled unless NODE_ENV=development.");
    process.exit(1);
  }

  console.log("Seeding development data for B03 with authoritative FAMES & R ICAB mapping...");
  try {
    const passwordHash = await bcrypt.hash("password123", 10);

    // FAMES & R Partners mapped from ICAB directory
    const icabPartners = [
      { email: "fmrashid@yahoo.com", fullName: "Rashid, Md Abdur", empCode: "474", role: "PARTNER" },
      { email: "hoquezhc@yahoo.com", fullName: "Hoque, Abu Sharf Manjurul", empCode: "695", role: "PARTNER" },
      { email: "shafi.selim1960@gmail.com", fullName: "Ahmed, Shafi Uddin", empCode: "839", role: "PARTNER" },
      { email: "haque.fouzia@gmail.com", fullName: "Haque, Fouzia", empCode: "1032", role: "PARTNER" },
      { email: "wadudca@gmail.com", fullName: "Wadud, Md. Abdul", empCode: "1379", role: "PARTNER" },
      { email: "dishaarif4@gmail.com", fullName: "Hoque, Evana", empCode: "1459", role: "PARTNER" }
    ];

    const userRecords = [];
    for (const p of icabPartners) {
      const [u] = await db.insert(users).values({
        email: p.email,
        passwordHash,
      }).onConflictDoUpdate({ target: users.email, set: { email: p.email } }).returning();
      userRecords.push({ ...p, id: u.id });
    }

    // Create FAMES & R firm
    // using "fames-r" as defined by backend/tests/platform-contract.test.ts
    const [firm1] = await db.insert(firms).values({
      name: "FAMES & R",
      subdomain: "fames-r",
    }).onConflictDoUpdate({ target: firms.subdomain, set: { name: "FAMES & R" } }).returning();

    // Assign roles & profiles
    for (const ur of userRecords) {
      await db.insert(firmUsers).values({
        userId: ur.id,
        firmId: firm1.id,
        role: ur.role as any
      }).onConflictDoNothing();

      const existing = await db.select().from(peopleProfiles).where(eq(peopleProfiles.userId, ur.id));
      if (!existing.length) {
        await db.insert(peopleProfiles).values({
          userId: ur.id,
          firmId: firm1.id,
          employeeCode: ur.empCode,
          fullName: ur.fullName,
          type: "PARTNER",
          designation: "Partner"
        });
      }
    }

    console.log("✅ Development data seeded with FAMES & R mapping.");
    console.log(`Seeded Firm: ${firm1.name} (${firm1.subdomain})`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
