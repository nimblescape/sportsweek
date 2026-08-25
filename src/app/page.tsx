import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { ROUTES } from "@/lib/routes";

// Only decides signed-in vs signed-out; /app then picks the landing for the role.
export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? ROUTES.appRoot : ROUTES.signIn);
}
