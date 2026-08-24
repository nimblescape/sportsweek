import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="text-sm font-medium">Sportsweek</span>
        <SignOutButton />
      </header>
      <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <p className="text-muted-foreground text-sm">Signed in as {user.email ?? user.uid}</p>
      </main>
    </div>
  );
}
