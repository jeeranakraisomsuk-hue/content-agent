import type { ReactNode } from "react";

const navigationItems = [
  { label: "ภาพรวมและเป้าหมาย", icon: "⌂" },
  { label: "ปฏิทินคอนเทนต์", icon: "◫" },
  { label: "Action Plan", icon: "✓" },
  { label: "บอร์ดการผลิต", icon: "▦" },
  { label: "งานที่ต้องแก้", icon: "↺" },
  { label: "คลังสื่อ", icon: "▧" },
  { label: "Reference และไอเดีย", icon: "✦" },
  { label: "แม่แบบแคปชั่น", icon: "≡" },
  { label: "ส่งโพสต์ผ่าน Make", icon: "↗" },
  { label: "ตั้งค่าและข้อมูล", icon: "⚙" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <nav aria-label="เมนูแดชบอร์ด">
        <div className="rail-brand" aria-label="INDY Content Studio">I</div>
        {navigationItems.map(({ label, icon }) => (
          <button key={label} type="button" className="rail-button" aria-label={label} data-tooltip={label}>
            <span aria-hidden="true">{icon}</span>
            <span className="rail-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="workspace-frame">
        <header className="command-capsule">
          <div className="profile-chip" aria-label="โปรไฟล์ INDY"><span aria-hidden="true">IN</span><span>INDY</span></div>
          <label className="workspace-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">ค้นหา</span>
            <input placeholder="ค้นหาไฟล์ งาน หรือไอเดีย" type="search" />
          </label>
          <button className="notification-button" type="button" aria-label="การแจ้งเตือน"><span aria-hidden="true">♧</span></button>
        </header>
        {children}
      </div>
    </div>
  );
}
