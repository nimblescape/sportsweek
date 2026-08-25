import type { ReactNode } from "react";
import { requireTeacher } from "@/lib/auth/guards";
import { TeacherNav } from "@/components/layout/teacher-nav";

// Guards the whole teacher area; the proxy check ahead of it is optimistic only.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  await requireTeacher();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-border shrink-0 border-b md:w-56 md:border-r md:border-b-0">
        <TeacherNav />
      </aside>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
