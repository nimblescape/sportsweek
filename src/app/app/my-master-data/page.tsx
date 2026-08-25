import { requireStudent } from "@/lib/auth/guards";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Placeholder until the master data form lands in #31 — the guard and the route are what US-15 needs now.
export default async function StudentMasterDataPage() {
  const user = await requireStudent();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
      <p className="text-muted-foreground text-sm">Angemeldet als {user.email ?? user.uid}</p>
      <SignOutButton />
    </div>
  );
}
