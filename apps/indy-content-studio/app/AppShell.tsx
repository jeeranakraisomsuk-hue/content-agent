import type { ReactNode } from "react";

const navigationItems = [
  "ภาพรวมและเป้าหมาย",
  "ปฏิทินคอนเทนต์",
  "Action Plan",
  "บอร์ดการผลิต",
  "งานที่ต้องแก้",
  "คลังสื่อ",
  "Reference และไอเดีย",
  "แม่แบบแคปชั่น",
  "ส่งโพสต์ผ่าน Make",
  "ตั้งค่าและข้อมูล",
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav aria-label="เมนูแดชบอร์ด">
        {navigationItems.map((label) => (
          <button key={label} type="button">
            {label}
          </button>
        ))}
      </nav>
      {children}
    </div>
  );
}
