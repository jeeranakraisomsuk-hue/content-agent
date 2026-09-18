"use client";

import { useEffect, useState } from "react";
import { canSendToLine } from "../../content/send-eligibility";
import type { AssetState } from "../../content/send-eligibility";
import type { DashboardTask } from "../dashboard-model";

interface LineSendConfirmationProps {
  task: DashboardTask | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

type SendState = "ready" | "pending" | "success" | "error";

function assetStateFor(task: DashboardTask): AssetState {
  return task.assets?.length ? "ready" : "missing";
}

export function LineSendConfirmation({ task, open, onCancel, onConfirm }: LineSendConfirmationProps) {
  const [sendState, setSendState] = useState<SendState>("ready");

  useEffect(() => {
    setSendState("ready");
  }, [open, task?.id]);

  if (!open || !task || !canSendToLine({ assetState: assetStateFor(task), caption: task.caption ?? "" })) {
    return null;
  }

  const selectedAsset = task.assets![0];
  const isPending = sendState === "pending";

  async function submit() {
    if (isPending || sendState === "success") return;

    setSendState("pending");
    try {
      await onConfirm();
      setSendState("success");
    } catch {
      setSendState("error");
    }
  }

  return (
    <div className="line-confirmation-backdrop">
      <section className="line-send-confirmation" role="dialog" aria-modal="true" aria-labelledby="line-confirmation-heading">
        <p className="eyebrow">ตรวจสอบก่อนส่ง</p>
        <h2 id="line-confirmation-heading">ยืนยันการส่งเข้า LINE OA</h2>

        {sendState === "success" ? (
          <div className="line-send-receipt" role="status">
            <strong>ส่งเข้า LINE OA เรียบร้อยแล้ว</strong>
            <span>ส่งไฟล์ {selectedAsset.name} ถึง PRIK GN แล้ว</span>
          </div>
        ) : (
          <>
            <div className="line-confirmation-preview" aria-label={`ไฟล์ที่เลือก ${selectedAsset.name}`}>
              <span className="line-preview-icon" aria-hidden="true">▣</span>
              <div>
                <span className="panel-label">ไฟล์ที่เลือก</span>
                <strong>{selectedAsset.name}</strong>
              </div>
            </div>
            <div className="line-caption-preview">
              <span className="panel-label">ตัวอย่างแคปชัน</span>
              <p>{task.caption}</p>
            </div>
            <div className="line-recipient"><span>ผู้รับ</span><strong>PRIK GN</strong></div>
            {sendState === "error" && <p className="line-send-error" role="alert">ส่งไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองส่งอีกครั้ง</p>}
          </>
        )}

        <div className="line-confirmation-actions">
          <button type="button" className="drawer-secondary-button" onClick={onCancel} disabled={isPending}>
            {sendState === "success" ? "ปิด" : "ยกเลิก"}
          </button>
          {sendState !== "success" && (
            <button type="button" className="drawer-delivery-button" onClick={submit} disabled={isPending}>
              {isPending ? "กำลังส่ง…" : sendState === "error" ? "ลองส่งอีกครั้ง" : "ยืนยันส่ง"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
