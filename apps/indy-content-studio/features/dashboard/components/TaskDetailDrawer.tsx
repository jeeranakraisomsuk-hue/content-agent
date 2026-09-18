import type { DashboardTask } from "../dashboard-model";
import { canSendToLine } from "../../content/send-eligibility";

interface TaskDetailDrawerProps {
  task: DashboardTask | null;
  onClose: () => void;
  onRequestSend: () => void;
}

export function TaskDetailDrawer({ task, onClose, onRequestSend }: TaskDetailDrawerProps) {
  if (!task) return null;
  const canSend = canSendToLine({
    assetState: task.assets?.length ? "ready" : "missing",
    caption: task.caption ?? "",
  });

  return (
    <aside className="task-drawer motion-material-surface motion-drawer" role="dialog" aria-modal="false" aria-label={`รายละเอียด ${task.title}`}>
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
          <div><dt>รูปแบบ</dt><dd>{[task.owner, task.format, task.category].filter(Boolean).join(" · ") || "ยังไม่ระบุ"}</dd></div>
          <div><dt>เป้าหมาย</dt><dd>{task.objective || "ยังไม่ระบุ"}</dd></div>
          <div><dt>แคปชัน</dt><dd>{task.caption || "ยังไม่ได้เขียนแคปชัน"}</dd></div>
          <div><dt>โน้ต</dt><dd>{task.notes || "ไม่มีโน้ตเพิ่มเติม"}</dd></div>
        </dl>
        <div className="drawer-assets">
          <p className="panel-label">ไฟล์งาน</p>
          {task.assets?.length ? <ul>{task.assets.map((asset) => <li key={`${asset.name}-${asset.size}`}>{asset.name}</li>)}</ul> : <p>ยังไม่ได้แนบไฟล์</p>}
        </div>
      </section>

      <section className="drawer-section" aria-labelledby="drawer-schedule-heading">
        <h3 id="drawer-schedule-heading">กำหนดเผยแพร่</h3>
        <p><time>{task.scheduledTime}</time> · เลือกแพลตฟอร์มเมื่อชิ้นงานพร้อม</p>
      </section>

      {task.lineDeliveryStatus === "sent" && (
        <div className="drawer-delivery-receipt" role="status">
          <strong>ส่งแล้ว</strong>
          <span>{task.lineDeliveryReceipt ?? "ส่งเข้า LINE OA เรียบร้อยแล้ว"}</span>
        </div>
      )}

      <div className="drawer-actions">
        <button type="button" className="drawer-secondary-button">บันทึกร่าง</button>
        <button type="button" className="drawer-delivery-button" onClick={onRequestSend} disabled={!canSend}>ส่งเข้า LINE OA</button>
      </div>
    </aside>
  );
}
