import { redirect } from "next/navigation";

import { AuthCard } from "@/components/AuthCard";
import { getUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  if (await getUser()) redirect("/dashboard");
  const { redirectTo } = await searchParams;

  return (
    <AuthCard
      title="Create your account"
      subtitle="Know when your group is free — before anyone asks."
    >
      <SignupForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
