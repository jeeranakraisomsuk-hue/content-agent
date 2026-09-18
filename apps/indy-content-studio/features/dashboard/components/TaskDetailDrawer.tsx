import type { DashboardTask } from "../dashboard-model";

interface TaskDetailDrawerProps {
  task: DashboardTask | null;
  onClose: () => void;
  onRequestSend: () => void;
}

export function TaskDetailDrawer({ task, onClose, onRequestSend }: TaskDetailDrawerProps) {
  if (!task) return null;

  return (
    <aside className="task-drawer" role="dialog" aria-modal="false" aria-label={`รายละเอียด ${task.title}`}>
      <div className="task-drawer-heading">
        <div>
          <p className="eyebrow">รายละเอียดงาน</p>
          <h2>{task.title}</h2>
        </div>
        <button type="button" className="drawer-close-button" onClick={onClose} aria-label="ปิดรายละเอียดงาน">×</button>
      </div>

      <div className="drawer-stage">
        <span>ขั้นตอนปัจจุบัน</span>
        <strong>{task.workflowStage ?? "กำลังเตรียมงาน"}</strong>
      </div>

      <section className="drawer-section" aria-labelledby="drawer-production-heading">
        <h3 id="drawer-production-heading">การผลิต</h3>
        <dl>
          <div><dt>ไฟล์งาน</dt><dd>ยังไม่ได้แนบไฟล์</dd></div>
          <div><dt>แคปชัน</dt><dd>เตรียมแคปชันก่อนส่งตรวจ</dd></div>
          <div><dt>ผู้ตรวจ</dt><dd>รอตรวจทาน</dd></div>
        </dl>
      </section>

      <section className="drawer-section" aria-labelledby="drawer-schedule-heading">
        <h3 id="drawer-schedule-heading">กำหนดเผยแพร่</h3>
        <p><time>{task.scheduledTime}</time> · เลือกแพลตฟอร์มเมื่อชิ้นงานพร้อม</p>
      </section>

      <div className="drawer-actions">
        <button type="button" className="drawer-secondary-button">บันทึกร่าง</button>
        <button type="button" className="drawer-delivery-button" onClick={onRequestSend}>ส่งเข้า LINE OA</button>
      </div>
    </aside>
  );
}
