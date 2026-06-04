import { redirect } from "next/navigation";

import { AuthCard } from "@/components/AuthCard";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  if (await getUser()) redirect("/dashboard");
  const { redirectTo } = await searchParams;

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Overlapp account.">
      <LoginForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
