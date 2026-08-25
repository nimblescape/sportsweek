import { AppShell } from "@/components/layout/app-shell";

// Both roles share this header; the teacher-only navigation is added by a nested layout (US-14, US-15).
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <AppShell>{children}</AppShell>;
}
