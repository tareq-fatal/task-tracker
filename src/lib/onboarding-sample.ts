import type { Locale } from "./enums";

/**
 * Trilingual seed content for the onboarding "example project". Kept out of the
 * i18n dictionary because it's structured data (not UI strings) and only used
 * once, when a user opts to create a demo project during onboarding.
 */

export type SampleSubtask = { title: string };
export type SampleTask = {
  title: string;
  description?: string;
  status: "Todo" | "InProgress" | "Done";
  priority: "Low" | "Medium" | "High" | "Critical";
  type?: "Epic" | "Story" | "Task" | "Bug";
  storyPoints?: number;
  /** days from now; negative = past, used for realistic due dates */
  dueInDays?: number;
  progress?: number;
  subtasks?: SampleSubtask[];
};

export type SampleProject = {
  name: string;
  description: string;
  color: string;
  sprintName: string;
  sprintGoal: string;
  tasks: SampleTask[];
};

const de: SampleProject = {
  name: "🚀 Beispielprojekt: Website-Relaunch",
  description:
    "Ein Demo-Projekt, das dir zeigt, wie Tasks, Board, Sprints und der Timer zusammenspielen. Du kannst es jederzeit löschen.",
  color: "#6366f1",
  sprintName: "Sprint 1 – Grundlagen",
  sprintGoal: "Startseite und Navigation fertigstellen",
  tasks: [
    {
      title: "Design-Konzept abstimmen",
      description: "Wireframes und Farbschema mit dem Team festlegen.",
      status: "Done",
      priority: "High",
      type: "Story",
      storyPoints: 5,
      dueInDays: -3,
      progress: 100,
    },
    {
      title: "Startseite umsetzen",
      description: "Hero-Bereich, Feature-Liste und Call-to-Action bauen.",
      status: "InProgress",
      priority: "High",
      type: "Task",
      storyPoints: 8,
      dueInDays: 2,
      progress: 40,
      subtasks: [
        { title: "Hero-Bereich" },
        { title: "Feature-Liste" },
        { title: "Call-to-Action-Button" },
      ],
    },
    {
      title: "Navigation & Footer",
      description: "Responsive Menü und Footer mit Links.",
      status: "InProgress",
      priority: "Medium",
      type: "Task",
      storyPoints: 3,
      dueInDays: 4,
      progress: 20,
    },
    {
      title: "Kontaktformular",
      description: "Formular mit Validierung und E-Mail-Versand.",
      status: "Todo",
      priority: "Medium",
      type: "Task",
      storyPoints: 3,
      dueInDays: 6,
    },
    {
      title: "Bug: Logo unscharf auf Mobilgeräten",
      description: "Auf kleinen Bildschirmen wird das Logo verpixelt dargestellt.",
      status: "Todo",
      priority: "Critical",
      type: "Bug",
      storyPoints: 2,
      dueInDays: 1,
    },
    {
      title: "Performance-Optimierung",
      description: "Bilder komprimieren und Ladezeit unter 2s bringen.",
      status: "Todo",
      priority: "Low",
      type: "Task",
      storyPoints: 5,
      dueInDays: 9,
    },
  ],
};

const en: SampleProject = {
  name: "🚀 Example project: Website relaunch",
  description:
    "A demo project that shows how tasks, the board, sprints and the timer work together. You can delete it any time.",
  color: "#6366f1",
  sprintName: "Sprint 1 – Foundations",
  sprintGoal: "Finish the home page and navigation",
  tasks: [
    {
      title: "Agree on the design concept",
      description: "Define wireframes and the color scheme with the team.",
      status: "Done",
      priority: "High",
      type: "Story",
      storyPoints: 5,
      dueInDays: -3,
      progress: 100,
    },
    {
      title: "Build the home page",
      description: "Build the hero area, feature list and call-to-action.",
      status: "InProgress",
      priority: "High",
      type: "Task",
      storyPoints: 8,
      dueInDays: 2,
      progress: 40,
      subtasks: [
        { title: "Hero area" },
        { title: "Feature list" },
        { title: "Call-to-action button" },
      ],
    },
    {
      title: "Navigation & footer",
      description: "Responsive menu and footer with links.",
      status: "InProgress",
      priority: "Medium",
      type: "Task",
      storyPoints: 3,
      dueInDays: 4,
      progress: 20,
    },
    {
      title: "Contact form",
      description: "Form with validation and email delivery.",
      status: "Todo",
      priority: "Medium",
      type: "Task",
      storyPoints: 3,
      dueInDays: 6,
    },
    {
      title: "Bug: logo blurry on mobile",
      description: "The logo looks pixelated on small screens.",
      status: "Todo",
      priority: "Critical",
      type: "Bug",
      storyPoints: 2,
      dueInDays: 1,
    },
    {
      title: "Performance optimization",
      description: "Compress images and get load time under 2s.",
      status: "Todo",
      priority: "Low",
      type: "Task",
      storyPoints: 5,
      dueInDays: 9,
    },
  ],
};

const ar: SampleProject = {
  name: "🚀 مشروع تجريبي: إعادة إطلاق الموقع",
  description:
    "مشروع توضيحي يُظهر كيف تتكامل المهام واللوحة والسبرنتات والمؤقّت. يمكنك حذفه في أي وقت.",
  color: "#6366f1",
  sprintName: "سبرنت 1 – الأساسيات",
  sprintGoal: "إنهاء الصفحة الرئيسية والتنقّل",
  tasks: [
    {
      title: "الاتفاق على مفهوم التصميم",
      description: "تحديد المخططات الأولية ونظام الألوان مع الفريق.",
      status: "Done",
      priority: "High",
      type: "Story",
      storyPoints: 5,
      dueInDays: -3,
      progress: 100,
    },
    {
      title: "بناء الصفحة الرئيسية",
      description: "بناء القسم الرئيسي وقائمة الميزات وزر الإجراء.",
      status: "InProgress",
      priority: "High",
      type: "Task",
      storyPoints: 8,
      dueInDays: 2,
      progress: 40,
      subtasks: [
        { title: "القسم الرئيسي" },
        { title: "قائمة الميزات" },
        { title: "زر الإجراء (CTA)" },
      ],
    },
    {
      title: "التنقّل والتذييل",
      description: "قائمة متجاوبة وتذييل يحتوي روابط.",
      status: "InProgress",
      priority: "Medium",
      type: "Task",
      storyPoints: 3,
      dueInDays: 4,
      progress: 20,
    },
    {
      title: "نموذج التواصل",
      description: "نموذج مع تحقّق وإرسال بريد إلكتروني.",
      status: "Todo",
      priority: "Medium",
      type: "Task",
      storyPoints: 3,
      dueInDays: 6,
    },
    {
      title: "خلل: الشعار غير واضح على الجوال",
      description: "يظهر الشعار مبكسلاً على الشاشات الصغيرة.",
      status: "Todo",
      priority: "Critical",
      type: "Bug",
      storyPoints: 2,
      dueInDays: 1,
    },
    {
      title: "تحسين الأداء",
      description: "ضغط الصور وخفض زمن التحميل إلى أقل من ثانيتين.",
      status: "Todo",
      priority: "Low",
      type: "Task",
      storyPoints: 5,
      dueInDays: 9,
    },
  ],
};

// Turkish sample project: reuse the English structure until a native
// sample is authored (only used for the optional demo project).
const byLocale: Record<Locale, SampleProject> = { de, en, ar, tr: en };

export function sampleProjectFor(locale: string): SampleProject {
  return byLocale[(locale as Locale)] ?? de;
}
