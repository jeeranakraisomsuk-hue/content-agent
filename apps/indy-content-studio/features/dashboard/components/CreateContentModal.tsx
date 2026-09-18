"use client";

import { useState, type FormEvent } from "react";
import type { ContentAsset } from "../dashboard-model";

export interface CreateContentInput {
  title: string;
  category: string;
  format: string;
  owner: string;
  objective: string;
  caption: string;
  scheduledTime: string;
  notes: string;
  assets: ContentAsset[];
}

interface CreateContentModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateContentInput) => void;
}

const initialInput: CreateContentInput = {
  title: "",
  category: "ทั่วไป",
  format: "โพสต์",
  owner: "INDY ทีมคอนเทนต์",
  objective: "",
  caption: "",
  scheduledTime: "",
  notes: "",
  assets: [],
};

export function CreateContentModal({ open, onClose, onCreate }: CreateContentModalProps) {
  const [input, setInput] = useState<CreateContentInput>(initialInput);
  const [titleError, setTitleError] = useState(false);

  if (!open) return null;

  function updateField(field: keyof CreateContentInput, value: string) {
    setInput((current) => ({ ...current, [field]: value }));
    if (field === "title" && value.trim()) setTitleError(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.title.trim()) {
      setTitleError(true);
      return;
    }

    onCreate({ ...input, title: input.title.trim() });
  }

  function selectAssets(files: FileList | null) {
    const assets = Array.from(files ?? []).map(({ name, type, size }) => ({ name, type, size }));
    setInput((current) => ({ ...current, assets }));
  }

  return (
    <div className="create-modal-backdrop">
      <section className="create-content-modal" role="dialog" aria-modal="true" aria-labelledby="create-content-heading">
        <div className="create-modal-heading">
          <div>
            <p className="eyebrow">เริ่มชิ้นงานใหม่</p>
            <h2 id="create-content-heading">สร้างคอนเทนต์</h2>
          </div>
          <button type="button" className="drawer-close-button" onClick={onClose} aria-label="ปิดการสร้างงาน">×</button>
        </div>

        <form onSubmit={submit}>
          <fieldset>
            <legend>1 · ตัวตนของชิ้นงาน</legend>
            <label>ชื่อชิ้นงาน<input value={input.title} onChange={(event) => updateField("title", event.target.value)} aria-invalid={titleError} /></label>
            {titleError && <p className="field-error" role="alert">กรุณาระบุชื่อชิ้นงาน</p>}
            <label>หมวดหมู่<select value={input.category} onChange={(event) => updateField("category", event.target.value)}><option value="ทั่วไป">ทั่วไป</option><option value="รีวิว">รีวิว</option><option value="การศึกษา">การศึกษา</option></select></label>
            <label>รูปแบบ<select value={input.format} onChange={(event) => updateField("format", event.target.value)}><option value="โพสต์">โพสต์</option><option value="Reels">Reels</option><option value="สตอรี่">สตอรี่</option></select></label>
            <label>ผู้รับผิดชอบ<input value={input.owner} onChange={(event) => updateField("owner", event.target.value)} /></label>
          </fieldset>

          <fieldset>
            <legend>2 · การผลิต</legend>
            <label>ไฟล์แนบ<input type="file" multiple onChange={(event) => selectAssets(event.target.files)} /></label>
            {input.assets.length > 0 && <ul className="selected-assets" aria-label="ไฟล์ที่เลือก">{input.assets.map((asset) => <li key={`${asset.name}-${asset.size}`}>{asset.name}</li>)}</ul>}
            <label>เป้าหมาย<textarea value={input.objective} onChange={(event) => updateField("objective", event.target.value)} /></label>
            <label>แคปชัน<textarea value={input.caption} onChange={(event) => updateField("caption", event.target.value)} /></label>
          </fieldset>

          <fieldset>
            <legend>3 · การเผยแพร่</legend>
            <label>กำหนดเวลา<input type="datetime-local" value={input.scheduledTime} onChange={(event) => updateField("scheduledTime", event.target.value)} /></label>
          </fieldset>

          <fieldset>
            <legend>4 · บันทึกเพิ่มเติม</legend>
            <label>โน้ต<textarea value={input.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
          </fieldset>

          <div className="create-modal-actions">
            <button type="button" className="drawer-secondary-button" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="create-submit-button">สร้างงาน</button>
          </div>
        </form>
      </section>
    </div>
  );
}
