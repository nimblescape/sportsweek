import { requireStudent } from "@/lib/auth/guards";
import { SectionPlaceholder } from "@/components/layout/section-placeholder";

// Only the shared header sits above this page — no left-side navigation (US-15).
// Replaced by the master data form in #31 to #35.
export default async function StudentMasterDataPage() {
  await requireStudent();

  return <SectionPlaceholder title="Meine Stammdaten" />;
}
