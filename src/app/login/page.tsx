import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <Image
            src="/logo.svg"
            alt="Task Tracker"
            width={56}
            height={56}
            className="mb-2"
            priority
          />
          <CardTitle className="text-2xl">Task Tracker</CardTitle>
          <CardDescription>
            Melde dich an · Sign in to manage your tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <div className="mt-6 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">
              Demo-Zugänge / Demo accounts
            </p>
            <p>
              admin / <code>Admin-2026!</code>
            </p>
            <p>
              alice · bob · charlie / <code>Demo-2026!</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
