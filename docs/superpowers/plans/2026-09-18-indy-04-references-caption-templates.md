# INDY References and Caption Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the inspiration library and versioned caption-template workspaces, including a safe template preview and apply API for the content editor.

**Architecture:** References are soft-deletable URL records. Caption templates own immutable versions; editing creates a new version so existing content can retain the exact text it used.

**Tech Stack:** React, TypeScript, shared repository provider, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01 and 02.
- Reference URLs must use HTTPS.
- Template variables use the verified single-brace form, for example `{course}` and `{date}`.
- Applying a template copies rendered text into the content draft; later template edits must not change that caption.

---

### Task 1: Implement reference and template commands

**Files:**
- Create: `apps/indy-content-studio/features/references/reference-commands.ts`
- Create: `apps/indy-content-studio/features/captions/template-commands.ts`
- Create: `apps/indy-content-studio/features/captions/render-template.ts`
- Test: `apps/indy-content-studio/tests/reference-commands.test.ts`
- Test: `apps/indy-content-studio/tests/caption-template.test.ts`

**Interfaces:**
- Produces: `addReference`, `updateReference`, `deleteReference`, `addCaptionTemplate`, `addCaptionTemplateVersion`, and `renderCaptionTemplate(body, values)`.

- [ ] **Step 1: Write failing tests for validation, versioning, and rendering**

```ts
expect(renderCaptionTemplate("เรียน {course} วันที่ {date}", { course: "ตัดผม", date: "20 ก.ย." })).toEqual({
  text: "เรียน ตัดผม วันที่ 20 ก.ย.",
  missing: [],
});
expect(renderCaptionTemplate("เรียน {course}", {})).toEqual({ text: "เรียน {course}", missing: ["course"] });
expect(addCaptionTemplateVersion(template, fixtureVersion).versions[0].body).not.toBe(fixtureVersion.body);
```

- [ ] **Step 2: Run tests and verify missing modules**

Run: `pnpm test -- tests/reference-commands.test.ts tests/caption-template.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement deterministic commands**

Trim titles, reject blank template bodies, parse unique variables with `/\{([a-zA-Z0-9_-]+)\}/g`, append versions without mutating earlier versions, and soft-delete references by setting `deletedAt`.

- [ ] **Step 4: Run the command tests**

Run: `pnpm test -- tests/reference-commands.test.ts tests/caption-template.test.ts`

Expected: PASS.

### Task 2: Build both complete workspaces

**Files:**
- Create: `apps/indy-content-studio/features/references/components/ReferencesWorkspace.tsx`
- Create: `apps/indy-content-studio/features/captions/components/CaptionTemplatesWorkspace.tsx`
- Create: `apps/indy-content-studio/features/captions/components/TemplatePreviewDialog.tsx`
- Test: `apps/indy-content-studio/tests/references-workspace.test.tsx`
- Test: `apps/indy-content-studio/tests/caption-templates-workspace.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`

**Interfaces:**
- Consumes: commands from Task 1 and `useDashboardData`.
- Produces: working `references` and `caption-templates` navigation workspaces.

- [ ] **Step 1: Write UI tests for complete reference CRUD**

Create a link, edit title/platform/tags, search it, open the external anchor, soft-delete it, and assert that an attached reference warns before removal.

- [ ] **Step 2: Write UI tests for template creation, new versions, missing-variable preview, and copy**

```tsx
await user.type(screen.getByLabelText("เนื้อหาแม่แบบ"), "สมัคร {course} ภายใน {date}");
await user.click(screen.getByRole("button", { name: "ดูตัวอย่าง" }));
expect(screen.getByText("ยังขาดค่า: course, date")).toBeVisible();
```

- [ ] **Step 3: Run both UI tests and verify failure**

Run: `pnpm test -- tests/references-workspace.test.tsx tests/caption-templates-workspace.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement References with search, platform filter, cards, edit dialog, and empty/error states**

Use semantic external anchors with `rel="noreferrer"`. Show attachment count and require confirmation before deleting an attached reference.

- [ ] **Step 5: Implement Caption Templates with version history**

Show template name, active version number, variables, updated date, preview values, rendered output, and `คัดลอกแคปชั่น`. Editing body creates a version; renaming the template does not.

- [ ] **Step 6: Replace both placeholders and run verification**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 7: Commit both finished workspaces**

```bash
git add apps/indy-content-studio/features/references apps/indy-content-studio/features/captions apps/indy-content-studio/app apps/indy-content-studio/tests
git commit -m "feat: add references and versioned caption templates"
```

### Human acceptance

1. Save two reference links on different platforms, search them, and open one.
2. Create a template with `{course}` and `{date}`.
3. Preview it with both values and copy the result.
4. Edit the template body and confirm version 1 remains visible in history.
5. Reload and confirm references, tags, templates, and versions persist.
