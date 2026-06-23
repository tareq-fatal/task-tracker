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
      name: "المسؤول",
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash: adminHash,
      role: "Admin",
      locale: "ar",
    },
  });

  // Demo users with Arabic display names (login usernames stay ASCII)
  const demoUsers = [
    { name: "علي", username: "alice", email: "alice@demo.local" },
    { name: "فاطمة", username: "bob", email: "bob@demo.local" },
    { name: "محمد", username: "charlie", email: "charlie@demo.local" },
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
        locale: "ar",
      },
    });
    users[u.username] = created.id;
  }

  // Reset demo data so re-seeding is idempotent
  await prisma.task.deleteMany({});
  await prisma.project.deleteMany({});

  const marketing = await prisma.project.create({
    data: {
      name: "مهام التسويق ٢٠٢٦",
      description: "حملات ومحتوى ووسائل تواصل اجتماعي لعام ٢٠٢٦.",
      color: "#ec4899",
      createdByUserId: admin.id,
    },
  });
  const roadmap = await prisma.project.create({
    data: {
      name: "خارطة الطريق — الربع الأول",
      description: "ميزات المنتج والإصدارات للربع الأول.",
      color: "#0ea5e9",
      createdByUserId: admin.id,
    },
  });

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
        projectId: tk.project,
        dueDate: tk.due,
        estimatedHours: tk.est ?? null,
        spentHours: tk.spent ?? 0,
        progress,
        completedAt: isDone ? tk.due : null,
      },
    });

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
