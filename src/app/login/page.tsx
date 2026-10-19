import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/roles";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ورود" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm rounded-[32px] p-7">
        <div className="mb-6 text-center">
          <Logo size="lg" className="mb-4 animate-pop justify-center" />
          <h1 className="text-xl font-bold">ورود به پنل Onvioo</h1>
          <p className="mt-1 text-sm text-muted-foreground">محتوا، مشتریان و تیم در یک جا</p>
        </div>
        <Suspense>
          <RedirectIfSignedIn />
        </Suspense>
        <LoginForm />
      </Card>
    </main>
  );
}

async function RedirectIfSignedIn() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return null;
}
