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
  // SAFETY: this seed WIPES tasks/projects/teams. Never let it run against a
  // production database by accident — use `npm run bootstrap` there instead.
  if (process.env.NODE_ENV === "production" && process.env.SEED_RESET !== "1") {
    console.error(
      "✋ Refusing to run the destructive seed in production.\n" +
        "   Use `npm run bootstrap` (non-destructive), or set SEED_RESET=1 to force a full reset."
    );
    process.exit(1);
  }

  console.log("🌱 Seeding…");

  const adminHash = await hash(ADMIN_PASSWORD);
  const demoHash = await hash(DEMO_PASSWORD);

  // --- Tenants -----------------------------------------------------
  const objektus = await prisma.tenant.upsert({
    where: { slug: "objektus" },
    update: {},
    create: { slug: "objektus", name: "Objektus", primaryColor: "#0ea5e9" },
  });
  const tarekT = await prisma.tenant.upsert({
    where: { slug: "tarek" },
    update: {},
    create: { slug: "tarek", name: "Tarek (privat)", primaryColor: "#8b5cf6" },
  });
  const marine = await prisma.tenant.upsert({
    where: { slug: "marine" },
    update: {},
    create: { slug: "marine", name: "Marine (Coast Shield)", primaryColor: "#1e3a8a", keineExterneKi: true }, // TOF-0839
  });
  const OBJ = objektus.id;

  // Super-admin (Tarek) — home tenant Objektus, can switch to any tenant.
  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: { hasSeenTour: true, role: "BackendAdmin", tenantId: OBJ },
    create: {
      name: "المسؤول",
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash: adminHash,
      role: "BackendAdmin",
      locale: "ar",
      hasSeenTour: true,
      tenantId: OBJ,
    },
  });

  // Demo users live in the Objektus tenant (regular members).
  const demoUsers = [
    { name: "علي", username: "alice", email: "alice@demo.local", role: "User" },
    { name: "فاطمة", username: "bob", email: "bob@demo.local", role: "User" },
    { name: "محمد", username: "charlie", email: "charlie@demo.local", role: "User" },
  ];

  const users: Record<string, string> = { admin: admin.id };
  for (const u of demoUsers) {
    const created = await prisma.user.upsert({
      where: { username: u.username },
      update: { hasSeenTour: false, role: u.role, tenantId: OBJ },
      create: {
        name: u.name,
        username: u.username,
        email: u.email,
        passwordHash: demoHash,
        role: u.role,
        locale: "ar",
        hasSeenTour: false,
        tenantId: OBJ,
      },
    });
    users[u.username] = created.id;
  }

  // Reset demo data so re-seeding is idempotent
  await prisma.task.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.team.deleteMany({});

  const marketing = await prisma.project.create({
    data: {
      name: "مهام التسويق ٢٠٢٦",
      description: "حملات ومحتوى ووسائل تواصل اجتماعي لعام ٢٠٢٦.",
      color: "#ec4899",
      createdByUserId: admin.id,
      tenantId: OBJ,
    },
  });
  const roadmap = await prisma.project.create({
    data: {
      name: "خارطة الطريق — الربع الأول",
      description: "ميزات المنتج والإصدارات للربع الأول.",
      color: "#0ea5e9",
      createdByUserId: admin.id,
      tenantId: OBJ,
    },
  });

  // Teams
  const teamMarketing = await prisma.team.create({
    data: {
      name: "فريق التسويق",
      description: "المسؤول عن الحملات والمحتوى.",
      color: "#ec4899",
      createdByUserId: admin.id,
      tenantId: OBJ,
      members: {
        create: [{ userId: users.alice }, { userId: users.bob }],
      },
    },
  });
  const teamProduct = await prisma.team.create({
    data: {
      name: "فريق المنتج",
      description: "تطوير الميزات والإصدارات.",
      color: "#0ea5e9",
      createdByUserId: admin.id,
      tenantId: OBJ,
      members: {
        create: [{ userId: users.charlie }, { userId: users.alice }],
      },
    },
  });

  // Map a project to its owning team for demo task assignment
  const projectTeam: Record<string, string> = {
    [marketing.id]: teamMarketing.id,
    [roadmap.id]: teamProduct.id,
  };

  type SeedTask = {
    title: string;
    description?: string;
    status: string;
    priority: string;
    assignee: string;
    project: string | null;
    due: Date;
    est?: number; // estimated hours
    spent?: number; // spent hours
    progress?: number; // used when no subtasks
    subtasks?: { title: string; done: boolean }[];
  };

  const tasks: SeedTask[] = [
    {
      title: "إعادة تصميم الصفحة الرئيسية",
      description: "تحديث قسم البطل وزر الحث على الإجراء.",
      status: "InProgress",
      priority: "High",
      assignee: "alice",
      project: marketing.id,
      due: daysFromNow(3),
      est: 8,
      spent: 3,
      subtasks: [
        { title: "تحديث لوحة الألوان", done: true },
        { title: "تصميم قسم البطل", done: true },
        { title: "زر الحث على الإجراء", done: false },
      ],
    },
    {
      title: "إرسال نشرة الربع الأول",
      description: "إنهاء القالب وجدولة الإرسال.",
      status: "Todo",
      priority: "Medium",
      assignee: "bob",
      project: marketing.id,
      due: daysFromNow(7),
      est: 4,
      progress: 0,
    },
    {
      title: "تقويم وسائل التواصل الاجتماعي",
      description: "تخطيط المنشورات لشهر يناير–مارس.",
      status: "Todo",
      priority: "Low",
      assignee: "charlie",
      project: marketing.id,
      due: daysFromNow(14),
      est: 16,
      progress: 10,
    },
    {
      title: "إنشاء نسخ الشعار",
      status: "Done",
      priority: "Medium",
      assignee: "alice",
      project: marketing.id,
      due: daysFromNow(-2),
      est: 4,
      spent: 5,
    },
    {
      title: "مصادقة واجهة برمجة التطبيقات",
      description: "تنفيذ جلسات الكوكيز والأدوار.",
      status: "InProgress",
      priority: "Critical",
      assignee: "bob",
      project: roadmap.id,
      due: daysFromNow(1),
      est: 16,
      spent: 10,
      subtasks: [
        { title: "تصميم المخطط", done: true },
        { title: "نقاط النهاية", done: false },
        { title: "الاختبارات", done: false },
      ],
    },
    {
      title: "السحب والإفلات في اللوحة",
      description: "لوحة كانبان مع تغيير الحالة بالسحب.",
      status: "Done",
      priority: "High",
      assignee: "alice",
      project: roadmap.id,
      due: daysFromNow(-5),
      est: 8,
      spent: 9,
    },
    {
      title: "دعم العمل دون اتصال (PWA)",
      description: "إعداد عامل الخدمة والبيان.",
      status: "Todo",
      priority: "Medium",
      assignee: "charlie",
      project: roadmap.id,
      due: daysFromNow(10),
      est: 6,
      progress: 0,
    },
    {
      title: "تحضير ترحيل قاعدة البيانات",
      description: "التحقق من التوافق مع Postgres.",
      status: "Todo",
      priority: "High",
      assignee: "bob",
      project: roadmap.id,
      due: daysFromNow(5),
      est: 4,
      progress: 25,
    },
    {
      title: "توثيق الإعداد",
      description: "كتابة دليل README والنشر.",
      status: "InProgress",
      priority: "Low",
      assignee: "charlie",
      project: roadmap.id,
      due: daysFromNow(8),
      est: 3,
      spent: 1,
      progress: 50,
    },
    {
      title: "مهمة تجريبية متأخرة",
      description: "هذه المهمة متأخرة عمدًا.",
      status: "Todo",
      priority: "Critical",
      assignee: "alice",
      project: null,
      due: daysFromNow(-1),
      est: 2,
      progress: 0,
    },
  ];

  const taskIds: Record<string, string> = {};
  for (const tk of tasks) {
    const isDone = tk.status === "Done";
    let progress = tk.progress ?? (isDone ? 100 : 0);
    if (tk.subtasks && tk.subtasks.length > 0) {
      const done = tk.subtasks.filter((s) => s.done).length;
      progress = Math.round((done / tk.subtasks.length) * 100);
    }

    const created = await prisma.task.create({
      data: {
        title: tk.title,
        description: tk.description ?? null,
        status: tk.status,
        priority: tk.priority,
        assignedToUserId: users[tk.assignee],
        createdByUserId: admin.id,
        tenantId: OBJ,
        projectId: tk.project,
        teamId: tk.project ? (projectTeam[tk.project] ?? null) : null,
        dueDate: tk.due,
        estimatedHours: tk.est ?? null,
        spentHours: tk.spent ?? 0,
        progress,
        completedAt: isDone ? tk.due : null,
      },
    });

    taskIds[tk.title] = created.id;

    if (tk.subtasks && tk.subtasks.length > 0) {
      await prisma.subtask.createMany({
        data: tk.subtasks.map((s, i) => ({
          taskId: created.id,
          title: s.title,
          done: s.done,
          order: i,
        })),
      });
    }
  }

  // Demo task dependencies (links)
  async function link(fromTitle: string, toTitle: string, type: string) {
    const a = taskIds[fromTitle];
    const b = taskIds[toTitle];
    if (a && b) {
      await prisma.taskLink
        .create({ data: { taskId: a, linkedTaskId: b, type } })
        .catch(() => {});
    }
  }
  await link("إرسال نشرة الربع الأول", "إعادة تصميم الصفحة الرئيسية", "DependsOn");
  await link("تحضير ترحيل قاعدة البيانات", "مصادقة واجهة برمجة التطبيقات", "DependsOn");
  await link("توثيق الإعداد", "دعم العمل دون اتصال (PWA)", "RelatedTo");

  // A couple of comments
  const firstTask = await prisma.task.findFirst({
    where: { title: "مصادقة واجهة برمجة التطبيقات" },
  });
  if (firstTask) {
    await prisma.taskComment.create({
      data: {
        taskId: firstTask.id,
        userId: users.alice,
        content: "يمكنني المساعدة في المراجعة 👍",
      },
    });
  }

  // ---------------------------------------------------------------
  // Coast Shield — real-world tasks (idempotent via the deleteMany above)
  // ---------------------------------------------------------------
  const coastShield = await prisma.project.create({
    data: {
      name: "Coast Shield / درع الساحل",
      description: "Maritime Lagebild für syrische Marine",
      color: "#1e3a8a", // naval blue
      createdByUserId: admin.id,
      tenantId: OBJ,
    },
  });
  const csTeam = await prisma.team.create({
    data: {
      name: "Coast Shield Customer",
      description: "Pilot-Team für das maritime Lagebild.",
      color: "#1e3a8a",
      createdByUserId: admin.id,
      tenantId: OBJ,
      members: {
        create: [
          { userId: users.alice },
          { userId: users.bob },
          { userId: users.charlie },
        ],
      },
    },
  });

  type CsTask = {
    title: string;
    status: string;
    priority: string;
    assignee?: string; // username; omitted = unassigned (users can claim it)
    inProject?: boolean; // belongs to the Coast Shield project + team
    due?: number; // daysFromNow
    completedAgo?: number; // for Done tasks
  };

  const csTasks: CsTask[] = [
    // Group 1 — Test-Aufgaben
    { title: "Lagebild Karten-Layer testen — alle Tiles laden", status: "InProgress", priority: "High", assignee: "alice", inProject: true, due: 2 },
    { title: "Mission Dispatch via Drag&Drop testen", status: "Todo", priority: "Medium", assignee: "bob", inProject: true, due: 3 },
    { title: "Reports CSV-Export prüfen", status: "Todo", priority: "Medium", assignee: "charlie", inProject: true, due: 4 },
    { title: "PDF-Export mit arabischer Schrift testen", status: "Todo", priority: "High", assignee: "alice", inProject: true, due: 4 },
    { title: "Mobile-PWA Login + Self-Marker testen", status: "InProgress", priority: "Medium", assignee: "bob", inProject: true, due: 5 },
    { title: "Boarding-Flow: Boot abmelden → zurückmelden", status: "Todo", priority: "Medium", assignee: "charlie", inProject: true, due: 6 },
    { title: "Units-Hierarchy /units/diagram laden", status: "Todo", priority: "Low", inProject: true, due: 7 },
    { title: "AI-Assistant Mock-Antworten testen", status: "Todo", priority: "Low", assignee: "alice", inProject: true, due: 8 },
    { title: "Inventory aller 10 Kategorien durchklicken", status: "Todo", priority: "Medium", assignee: "bob", inProject: true, due: 9 },
    { title: "Taskforce-Panel + Mobile-Multi-Equipment-View", status: "Todo", priority: "Medium", assignee: "charlie", inProject: true, due: 10 },

    // Group 2 — Features pending (High)
    { title: "Reports Phase 2 — KPIs + Analytics-Dashboard bauen", status: "Todo", priority: "High", assignee: "alice", inProject: true, due: 14 },
    { title: "Reports Phase 3 — Infographic-Generator", status: "Todo", priority: "High", assignee: "alice", inProject: true, due: 21 },
    { title: "Furuno-Radar-Hardware bestellen (~300-450€)", status: "Todo", priority: "Critical", assignee: "admin", inProject: true, due: 5 },
    { title: "NMEA-Integration nach Hardware-Lieferung", status: "Todo", priority: "High", assignee: "bob", inProject: true, due: 30 },
    { title: "Customer-Feedback nach 2-Wochen-Pilot sammeln", status: "Todo", priority: "High", assignee: "admin", inProject: true, due: 14 },

    // Group 3 — Andere Projekte (cross-project, kein CS-Projekt/Team)
    { title: "Mawaddah Bundle-ID entscheiden (io vs com)", status: "Todo", priority: "Medium", assignee: "admin", due: 3 },
    { title: "Mawaddah Backend live deployen (Supabase)", status: "Todo", priority: "High", assignee: "admin", due: 7 },
    { title: "OBJEKTUS-IoT Foto-Upload live testen mit echtem FSM", status: "Todo", priority: "High", assignee: "bob", due: 6 },
    { title: "OBJ-FSM Capacitor Mobile-Build", status: "Todo", priority: "Medium", assignee: "charlie", due: 9 },
    { title: "OBJ-FSM auf Static-Host deployen", status: "Todo", priority: "Medium", assignee: "charlie", due: 12 },

    // Group 4 — Bereits fertig (Done, als History)
    { title: "Coast Shield Build BG deployed", status: "Done", priority: "High", assignee: "admin", inProject: true, completedAgo: 10 },
    { title: "Training-Module M0-M5 implementiert", status: "Done", priority: "High", assignee: "alice", inProject: true, completedAgo: 20 },
    { title: "Task-Tracker v5 Filter-Bar", status: "Done", priority: "Medium", assignee: "admin", completedAgo: 3 },
    { title: "OBJ-FSM PWA fertig", status: "Done", priority: "Medium", assignee: "bob", completedAgo: 15 },
  ];

  for (const tk of csTasks) {
    const isDone = tk.status === "Done";
    await prisma.task.create({
      data: {
        title: tk.title,
        status: tk.status,
        priority: tk.priority,
        assignedToUserId: tk.assignee ? users[tk.assignee] : null,
        createdByUserId: admin.id,
        tenantId: OBJ,
        projectId: tk.inProject ? coastShield.id : null,
        teamId: tk.inProject ? csTeam.id : null,
        dueDate: isDone
          ? daysFromNow(-(tk.completedAgo ?? 1))
          : tk.due != null
            ? daysFromNow(tk.due)
            : null,
        progress: isDone ? 100 : 0,
        completedAt: isDone ? daysFromNow(-(tk.completedAgo ?? 1)) : null,
      },
    });
  }

  // --- Other tenants (isolation demo) ------------------------------
  async function seedTenant(
    tenantId: string,
    username: string,
    displayName: string,
    items: { title: string; status: string; priority: string; due: number }[]
  ) {
    const u = await prisma.user.upsert({
      where: { username },
      update: { tenantId, role: "Admin", hasSeenTour: true },
      create: {
        name: displayName,
        username,
        email: `${username}@demo.local`,
        passwordHash: demoHash,
        role: "Admin",
        locale: "de",
        hasSeenTour: true,
        tenantId,
      },
    });
    for (const it of items) {
      await prisma.task.create({
        data: {
          title: it.title,
          status: it.status,
          priority: it.priority,
          progress: it.status === "Done" ? 100 : 0,
          dueDate: daysFromNow(it.due),
          completedAt: it.status === "Done" ? daysFromNow(it.due) : null,
          assignedToUserId: u.id,
          createdByUserId: u.id,
          tenantId,
        },
      });
    }
  }

  await seedTenant(tarekT.id, "tarek", "Tarek", [
    { title: "Steuerunterlagen 2025 sortieren", status: "Todo", priority: "Medium", due: 5 },
    { title: "Website-Domain verlängern", status: "InProgress", priority: "High", due: 2 },
    { title: "Backup-Strategie aufsetzen", status: "Done", priority: "Low", due: -3 },
  ]);
  await seedTenant(marine.id, "marine", "Marine Ops", [
    { title: "Radar-Kalibrierung Pier 3", status: "InProgress", priority: "Critical", due: 1 },
    { title: "Wachplan KW 27 erstellen", status: "Todo", priority: "High", due: 4 },
    { title: "AIS-Empfänger Wartung", status: "Done", priority: "Medium", due: -2 },
  ]);

  console.log("✅ Seed complete.");
  console.log(`   Super-Admin:  ${ADMIN_USERNAME} / ${ADMIN_PASSWORD} (Objektus, sieht alle Tenants)`);
  console.log(`   Tenants: objektus · tarek · marine`);
  console.log(`   Admin:  ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  console.log(`   Demo:   alice · bob · charlie / ${DEMO_PASSWORD}`);
  console.log(`   + Coast Shield project, team & ${csTasks.length} tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
