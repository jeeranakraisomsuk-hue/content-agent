import type { AssetState } from "../send-eligibility";
import { canSendToLine } from "../send-eligibility";

export function ContentEditor({
  assetState,
  caption,
}: {
  assetState: AssetState;
  caption: string;
}) {
  const canSend = canSendToLine({ assetState, caption });

  return (
    <section aria-labelledby="content-editor-heading">
      <h2 id="content-editor-heading">เตรียมส่งคอนเทนต์</h2>
      <p>ไฟล์: {assetState === "ready" ? "พร้อม" : "ยังไม่พร้อม"}</p>
      <p>แคปชัน: {caption.trim() || "ยังไม่กรอก"}</p>
      <button type="button" disabled={!canSend}>
        ส่งเข้า LINE OA
      </button>
    </section>
  );
}
