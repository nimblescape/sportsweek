import { Suspense } from "react";
import { SignInCard } from "@/components/auth/sign-in-card";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInCard />
    </Suspense>
  );
}
