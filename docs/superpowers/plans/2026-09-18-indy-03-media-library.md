# INDY Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a persistent media library with uploads, external links, previews, tags, editing, trash, and restoration.

**Architecture:** Metadata stays in `DashboardState`; binary file data lives in a separate IndexedDB blob store keyed by media ID. Object URLs are created only for preview and revoked on cleanup.

**Tech Stack:** React, native IndexedDB Blob storage, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01 and 02.
- Browser uploads are limited to 50 MB per file.
- Backups contain metadata but do not silently embed binary files.
- Delete is soft delete; restore returns the same media ID.
- External URLs must use `https:`.

---

### Task 1: Implement the media blob store and commands

**Files:**
- Create: `apps/indy-content-studio/features/media/media-blob-store.ts`
- Create: `apps/indy-content-studio/features/media/indexeddb-media-blob-store.ts`
- Create: `apps/indy-content-studio/features/media/media-commands.ts`
- Test: `apps/indy-content-studio/tests/media-store.test.ts`
- Test: `apps/indy-content-studio/tests/media-commands.test.ts`

**Interfaces:**
- Produces:

```ts
export interface MediaBlobStore {
  put(id: string, file: Blob): Promise<void>;
  get(id: string): Promise<Blob | null>;
  remove(id: string): Promise<void>;
}
```

Commands: `createUploadedMedia`, `createExternalMedia`, `updateMedia`, `moveMediaToTrash`, and `restoreMedia`.

- [ ] **Step 1: Write failing tests for blob round-trip and command validation**

```ts
await store.put("asset-1", new Blob(["video"], { type: "video/mp4" }));
expect(await (await store.get("asset-1"))?.text()).toBe("video");
expect(() => createExternalMedia(state, fixture({ externalUrl: "http://unsafe.test" }))).toThrow("ต้องเป็นลิงก์ https");
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm test -- tests/media-store.test.ts tests/media-commands.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the blob store in object store `media-blobs`**

Use the same `indy-content-studio` database and increment the database version to `2`. Upgrade must create `media-blobs` without deleting the `dashboard` store.

- [ ] **Step 4: Implement commands with fixed error messages**

Reject files over `52_428_800` bytes, blank names, unsafe URLs, and duplicate tag values after trimming. An external video requires a safe HTTPS preview-image URL. `moveMediaToTrash` sets `deletedAt`; `restoreMedia` sets it to `null`.

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test -- tests/media-store.test.ts tests/media-commands.test.ts`

Expected: PASS.

### Task 2: Build upload/link dialogs and media library states

**Files:**
- Create: `apps/indy-content-studio/features/media/components/MediaLibraryWorkspace.tsx`
- Create: `apps/indy-content-studio/features/media/components/MediaPreviewDialog.tsx`
- Create: `apps/indy-content-studio/tests/media-library.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`

**Interfaces:**
- Consumes: `useDashboardData`, `MediaBlobStore`, media commands.
- Produces: working `media-library` workspace.

- [ ] **Step 1: Write UI tests for upload, link, tag edit, preview, trash, restore, empty, and error states**

```tsx
await user.upload(screen.getByLabelText("เลือกไฟล์สื่อ"), new File(["image"], "ผลงาน.jpg", { type: "image/jpeg" }));
expect(await screen.findByText("ผลงาน.jpg")).toBeVisible();
await user.click(screen.getByRole("button", { name: "ย้าย ผลงาน.jpg ไปถังขยะ" }));
await user.click(screen.getByRole("tab", { name: "ถังขยะ" }));
expect(screen.getByText("ผลงาน.jpg")).toBeVisible();
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm test -- tests/media-library.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the library**

Provide `ทั้งหมด` and `ถังขยะ` tabs, upload and external-link actions, search, type filter, tag chips, preview, edit, delete, and restore. Show file size and source. Disable permanent removal when the media ID is referenced by non-deleted content.

- [ ] **Step 4: Implement preview lifecycle safely**

Create an object URL only after loading a blob, render image/video according to MIME type, expose an `เปิดลิงก์ต้นทาง` anchor for external media, and call `URL.revokeObjectURL` when the dialog closes or changes assets.

- [ ] **Step 5: Replace the media placeholder and run verification**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit the complete media workflow**

```bash
git add apps/indy-content-studio/features/media apps/indy-content-studio/app apps/indy-content-studio/tests
git commit -m "feat: add persistent media library"
```

### Task 3: Add optional Google Drive upload for provider-accessible media

**Files:**
- Create: `apps/indy-content-studio/features/media/server/google-drive-media-client.ts`
- Create: `apps/indy-content-studio/features/media/server/media-delivery-url.ts`
- Create: `apps/indy-content-studio/features/media/video-poster.ts`
- Create: `apps/indy-content-studio/app/api/media/upload/route.ts`
- Create: `apps/indy-content-studio/app/api/media/provider/[fileId]/route.ts`
- Test: `apps/indy-content-studio/tests/media-upload-route.test.ts`
- Modify: `apps/indy-content-studio/features/media/components/MediaLibraryWorkspace.tsx`
- Modify: `apps/indy-content-studio/package.json`
- Modify: `apps/indy-content-studio/pnpm-lock.yaml`

**Interfaces:**
- Produces: `POST /api/media/upload` returning `{ assetId, providerFileId, previewProviderFileId, remoteStatus: "ready" }` and a signed provider route that streams private Drive media to LINE or Make.

- [ ] **Step 1: Add the pinned server-auth dependency**

Run: `pnpm add google-auth-library@10.3.0`

Expected: package and lockfile update.

- [ ] **Step 2: Write route tests before implementation**

Test disconnected configuration `503`, missing file `400`, file over 50 MB `413`, missing video preview `400`, Drive rejection `502`, successful image/video upload `200`, response sanitization, invalid/expired delivery signature `401`, full-file streaming, and HTTP range streaming for video. Use injected fake authentication and fetch clients; never contact Google in tests.

- [ ] **Step 3: Run the route test and verify failure**

Run: `pnpm test -- tests/media-upload-route.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement server-only Google Drive upload**

Authenticate with `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`, upload privately to `GOOGLE_DRIVE_FOLDER_ID`, and return original and preview provider file IDs. Images reuse the image as preview; videos require a JPEG poster generated from the first decodable frame by `video-poster.ts`. Sign delivery URLs with `INDY_MEDIA_SIGNING_SECRET`, absolute base `APP_PUBLIC_BASE_URL`, file ID, purpose, and expiry. The provider route verifies signature and expiry before streaming from Drive and supports `Range` responses for video. Never make the Drive folder public.

- [ ] **Step 5: Connect upload progress without lying about local-only assets**

Save the local blob first. For video, load metadata, seek to the first decodable frame, draw to canvas, and encode a JPEG poster; show a specific error if the browser cannot decode the video. When Drive is connected, upload and store `providerFileId`, `previewProviderFileId`, and `remoteStatus: "ready"`; signed URLs are generated only server-side when an integration needs them and are never persisted. On failure, retain the local asset with `remoteStatus: "failed"` and a retry action. When disconnected, use `remoteStatus: "local-only"`.

- [ ] **Step 6: Run the complete media verification and amend the job commit**

Run: `pnpm test -- tests/media-store.test.ts tests/media-commands.test.ts tests/media-library.test.tsx tests/media-upload-route.test.ts && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add apps/indy-content-studio/features/media apps/indy-content-studio/app/api/media apps/indy-content-studio/tests apps/indy-content-studio/package.json apps/indy-content-studio/pnpm-lock.yaml
git commit -m "feat: upload integration-ready media to drive"
```

### Human acceptance

1. Upload an image below 50 MB, preview it, tag it, and reload.
2. Add an HTTPS external video link and open it.
3. Move both items to trash and restore one.
4. Confirm the restored item keeps its tags and preview.
5. Try a file over 50 MB and an HTTP link; confirm each shows a specific error and does not create a card.
6. With Drive disconnected, confirm the asset is labeled local-only; with a test Drive connection, upload and confirm a provider file ID is recorded while the Drive file remains private.
7. Open a short-lived signed preview, then confirm an expired or modified URL is rejected.
