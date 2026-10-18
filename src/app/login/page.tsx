import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/roles";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ورود" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-7">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
            O
          </div>
          <h1 className="text-lg font-bold">ورود به پنل Onvioo</h1>
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
