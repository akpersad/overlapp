import { redirect } from "next/navigation";

import { AuthCard } from "@/components/AuthCard";
import { getUser } from "@/lib/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  if (await getUser()) redirect("/dashboard");

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
