import { AppShell } from "./AppShell";
import { DashboardPreview } from "../features/dashboard/components/DashboardPreview";

export default function HomePage() {
  return (
    <AppShell>
      <main>
        <p>INDY / พื้นที่คอนเทนต์ · ไฟล์เก็บบน Google Drive · โพสต์ตามคิว Make</p>
        <DashboardPreview />
      </main>
    </AppShell>
  );
}
