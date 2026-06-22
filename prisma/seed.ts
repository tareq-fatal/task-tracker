import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

// Load .env manually so `npm run seed` (raw tsx) has the same env as Prisma CLI.
function loadEnv() {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

const prisma = new PrismaClient();

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin-2026!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@task-tracker.local";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-2026!";

function daysFromNow(d: number): Date {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(12, 0, 0, 0);
  return x;
}

async function main() {
  console.log("🌱 Seeding…");

  const adminHash = await hash(ADMIN_PASSWORD);
  const demoHash = await hash(DEMO_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {},
    create: {
      name: "Administrator",
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash: adminHash,
      role: "Admin",
      locale: "de",
    },
  });

  const demoUsers = [
    { name: "Alice Müller", username: "alice", email: "alice@demo.local" },
    { name: "Bob Schmidt", username: "bob", email: "bob@demo.local" },
    { name: "Charlie Weber", username: "charlie", email: "charlie@demo.local" },
  ];

  const users: Record<string, string> = { admin: admin.id };
  for (const u of demoUsers) {
    const created = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        name: u.name,
        username: u.username,
        email: u.email,
        passwordHash: demoHash,
        role: "User",
        locale: "de",
      },
    });
    users[u.username] = created.id;
  }

  // Reset demo data so re-seeding is idempotent
  await prisma.task.deleteMany({});
  await prisma.project.deleteMany({});

  const marketing = await prisma.project.create({
    data: {
      name: "Marketing 2026",
      description: "Kampagnen, Content und Social Media für 2026.",
      color: "#ec4899",
      createdByUserId: admin.id,
    },
  });
  const roadmap = await prisma.project.create({
    data: {
      name: "Q1 Roadmap",
      description: "Produkt-Features und Releases für Q1.",
      color: "#6366f1",
      createdByUserId: admin.id,
    },
  });

  const tasks = [
    {
      title: "Landingpage Redesign",
      description: "Hero-Section und CTA überarbeiten.",
      status: "InProgress",
      priority: "High",
      assignee: "alice",
      project: marketing.id,
      due: daysFromNow(3),
    },
    {
      title: "Newsletter Q1 versenden",
      description: "Template finalisieren und Versand planen.",
      status: "Todo",
      priority: "Medium",
      assignee: "bob",
      project: marketing.id,
      due: daysFromNow(7),
    },
    {
      title: "Social-Media-Kalender",
      description: "Postings für Januar–März planen.",
      status: "Todo",
      priority: "Low",
      assignee: "charlie",
      project: marketing.id,
      due: daysFromNow(14),
    },
    {
      title: "Logo-Varianten erstellen",
      status: "Done",
      priority: "Medium",
      assignee: "alice",
      project: marketing.id,
      due: daysFromNow(-2),
    },
    {
      title: "API Authentifizierung",
      description: "Cookie-Session + Rollen implementieren.",
      status: "InProgress",
      priority: "Critical",
      assignee: "bob",
      project: roadmap.id,
      due: daysFromNow(1),
    },
    {
      title: "Kanban Drag & Drop",
      description: "Board mit Statuswechsel per Drag&Drop.",
      status: "Done",
      priority: "High",
      assignee: "alice",
      project: roadmap.id,
      due: daysFromNow(-5),
    },
    {
      title: "PWA Offline-Support",
      description: "Service-Worker und Manifest einrichten.",
      status: "Todo",
      priority: "Medium",
      assignee: "charlie",
      project: roadmap.id,
      due: daysFromNow(10),
    },
    {
      title: "Datenbank-Migration vorbereiten",
      description: "Postgres-Kompatibilität prüfen.",
      status: "Todo",
      priority: "High",
      assignee: "bob",
      project: roadmap.id,
      due: daysFromNow(5),
    },
    {
      title: "Onboarding-Dokumentation",
      description: "README und Deploy-Guide schreiben.",
      status: "InProgress",
      priority: "Low",
      assignee: "charlie",
      project: roadmap.id,
      due: daysFromNow(8),
    },
    {
      title: "Überfällige Demo-Task",
      description: "Diese Task ist absichtlich überfällig.",
      status: "Todo",
      priority: "Critical",
      assignee: "alice",
      project: null,
      due: daysFromNow(-1),
    },
  ];

  for (const tk of tasks) {
    await prisma.task.create({
      data: {
        title: tk.title,
        description: tk.description ?? null,
        status: tk.status,
        priority: tk.priority,
        assignedToUserId: users[tk.assignee],
        createdByUserId: admin.id,
        projectId: tk.project,
        dueDate: tk.due,
      },
    });
  }

  // A couple of comments
  const firstTask = await prisma.task.findFirst({
    where: { title: "API Authentifizierung" },
  });
  if (firstTask) {
    await prisma.taskComment.create({
      data: {
        taskId: firstTask.id,
        userId: users.alice,
        content: "Ich kann beim Review helfen 👍",
      },
    });
  }

  console.log("✅ Seed complete.");
  console.log(`   Admin:  ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  console.log(`   Demo:   alice · bob · charlie / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
