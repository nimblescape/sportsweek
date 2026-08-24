import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Minimal protected landing page — proxy.ts already redirects unauthenticated requests to /sign-in.
export default async function AppHomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
      <p className="text-muted-foreground text-sm">Signed in as {user.email ?? user.uid}</p>
      <SignOutButton />
    </div>
  );
}
