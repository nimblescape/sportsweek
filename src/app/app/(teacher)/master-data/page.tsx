import { redirect } from "next/navigation";
import { MASTER_DATA_SECTIONS } from "@/lib/routes";

// The section itself has no view; it opens on its first category.
export default function MasterDataIndexPage() {
  redirect(MASTER_DATA_SECTIONS[0].href);
}
