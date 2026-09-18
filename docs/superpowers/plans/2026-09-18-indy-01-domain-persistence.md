# INDY Domain and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace page-owned sample state with one typed, durable repository and one shared React data provider.

**Architecture:** Store a versioned `DashboardState` document in IndexedDB and expose it through a repository contract. React consumes immutable snapshots through `DashboardDataProvider`; pure commands perform all mutations so later pages cannot diverge.

**Tech Stack:** Next.js 15.5, React 19.1, TypeScript 5.9, native IndexedDB, Vitest 3.2, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Thai is the primary interface language.
- Store dates as ISO strings and display them in Asia/Bangkok.
- Do not store integration secrets in `DashboardState`.
- Every repository implementation must pass the same contract suite.
- Existing Today UI behavior must remain working while its data source changes.

---

### Task 0: Repair the known TypeScript baseline

**Files:**
- Create: `worker.d.ts`

**Interfaces:**
- Produces: a type declaration for the existing root `worker.js` default export used by `tests/line-webhook-worker.test.ts`.

- [ ] **Step 1: Reproduce the exact baseline failure**

Run: `pnpm typecheck`

Expected: FAIL only with TS7016 stating that `worker.js` has no declaration file. If any additional error appears, stop and report it before editing.

- [ ] **Step 2: Add the worker declaration**

```ts
interface LineWebhookWorkerEnv {
  LINE_CHANNEL_SECRET?: string;
}

declare const worker: {
  fetch(request: Request, env: LineWebhookWorkerEnv): Promise<Response>;
};

export default worker;
```

- [ ] **Step 3: Verify the baseline is green**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: all commands exit 0; the test count remains at least the verified baseline of 53 tests.

- [ ] **Step 4: Commit the isolated baseline repair**

```bash
git add -- worker.d.ts
git commit -m "fix: declare LINE webhook worker type"
```

### Task 1: Define the canonical domain and deterministic defaults

**Files:**
- Create: `apps/indy-content-studio/features/domain/types.ts`
- Create: `apps/indy-content-studio/features/domain/create-empty-state.ts`
- Test: `apps/indy-content-studio/tests/domain-state.test.ts`

**Interfaces:**
- Produces: `DashboardState`, `ContentItem`, `MediaAsset`, `ProcessStep`, `PlatformSchedule`, `Category`, `FormatDefinition`, `ReferenceIdea`, `CaptionTemplate`, `CorrectionRequest`, `MonthlyGoal`, and `createEmptyDashboardState()`.

- [ ] **Step 1: Write the failing default-state test**

```ts
import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

describe("createEmptyDashboardState", () => {
  it("creates schema version 1 with canonical production configuration", () => {
    const state = createEmptyDashboardState();
    expect(state.schemaVersion).toBe(1);
    expect(state.formats.map((format) => format.mediaKind)).toEqual(["video", "image", "image", "other"]);
    expect(state.contents).toEqual([]);
    expect(state.integrations.every((item) => item.status === "disconnected")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `pnpm test -- tests/domain-state.test.ts`

Expected: FAIL because `features/domain/create-empty-state.ts` does not exist.

- [ ] **Step 3: Add the exact state envelope**

```ts
export interface DashboardState {
  schemaVersion: 1;
  contents: ContentItem[];
  media: MediaAsset[];
  categories: Category[];
  formats: FormatDefinition[];
  references: ReferenceIdea[];
  captionTemplates: CaptionTemplate[];
  corrections: CorrectionRequest[];
  monthlyGoals: MonthlyGoal[];
  publicationAttempts: PublicationAttempt[];
  integrations: IntegrationStatus[];
  notificationReadIds: string[];
}
```

Define every supporting type from the spec in the same file. `createEmptyDashboardState()` must seed the original categories (`ความรู้`, `รีวิว`, `บรรยากาศ`), formats (`วิดีโอ`, `ภาพเดี่ยว`, `อัลบั้ม`, `เป้าเดิม — ยังไม่แบ่งรูปแบบ`), their verified media-kind/platform mappings, seven production statuses, and disconnected integration records without creating sample content.

- [ ] **Step 4: Run the domain test**

Run: `pnpm test -- tests/domain-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the canonical domain**

```bash
git add apps/indy-content-studio/features/domain apps/indy-content-studio/tests/domain-state.test.ts
git commit -m "feat: define canonical dashboard domain"
```

### Task 2: Implement one repository contract and two implementations

**Files:**
- Create: `apps/indy-content-studio/features/data/dashboard-repository.ts`
- Create: `apps/indy-content-studio/features/data/memory-dashboard-repository.ts`
- Create: `apps/indy-content-studio/features/data/indexeddb-dashboard-repository.ts`
- Create: `apps/indy-content-studio/tests/dashboard-repository-contract.ts`
- Create: `apps/indy-content-studio/tests/indexeddb-dashboard-repository.test.ts`
- Modify: `apps/indy-content-studio/package.json`
- Modify: `apps/indy-content-studio/pnpm-lock.yaml`

**Interfaces:**
- Consumes: `DashboardState`, `createEmptyDashboardState()`.
- Produces:

```ts
export type DashboardListener = (state: DashboardState) => void;
export interface DashboardRepository {
  read(): Promise<DashboardState>;
  write(next: DashboardState): Promise<void>;
  subscribe(listener: DashboardListener): () => void;
}
```

- [ ] **Step 1: Add the repository contract suite before implementation**

```ts
export function dashboardRepositoryContract(makeRepository: () => DashboardRepository) {
  it("persists an immutable snapshot and notifies subscribers", async () => {
    const repository = makeRepository();
    const seen: DashboardState[] = [];
    const unsubscribe = repository.subscribe((state) => seen.push(state));
    const state = await repository.read();
    const next = { ...state, categories: [...state.categories, categoryFixture] };
    await repository.write(next);
    next.categories[0].name = "mutated outside";
    expect((await repository.read()).categories[0].name).not.toBe("mutated outside");
    expect(seen).toHaveLength(1);
    unsubscribe();
  });
}
```

- [ ] **Step 2: Add `fake-indexeddb` as a development dependency**

Run: `pnpm add -D fake-indexeddb@6.2.2`

Expected: `package.json` and `pnpm-lock.yaml` change; no runtime dependency is added.

- [ ] **Step 3: Run both contract suites and verify failure**

Run: `pnpm test -- tests/indexeddb-dashboard-repository.test.ts`

Expected: FAIL because repository implementations do not exist.

- [ ] **Step 4: Implement the memory repository with `structuredClone` on read and write**

Use a `Set<DashboardListener>`. Notify after the write has replaced the internal snapshot. Never return the internal object reference.

- [ ] **Step 5: Implement IndexedDB with one versioned document**

Use database `indy-content-studio`, object store `dashboard`, key `current`, and database version `1`. If the document is absent, write and return `createEmptyDashboardState()`. Resolve a write only after the transaction completes; notify subscribers with a clone after completion.

- [ ] **Step 6: Run repository tests**

Run: `pnpm test -- tests/indexeddb-dashboard-repository.test.ts`

Expected: PASS for memory and IndexedDB implementations.

- [ ] **Step 7: Commit the repository boundary**

```bash
git add apps/indy-content-studio/features/data apps/indy-content-studio/tests/dashboard-repository-contract.ts apps/indy-content-studio/tests/indexeddb-dashboard-repository.test.ts apps/indy-content-studio/package.json apps/indy-content-studio/pnpm-lock.yaml
git commit -m "feat: persist dashboard state in indexeddb"
```

### Task 3: Provide atomic commands and connect the current dashboard

**Files:**
- Create: `apps/indy-content-studio/features/data/dashboard-commands.ts`
- Create: `apps/indy-content-studio/features/data/DashboardDataProvider.tsx`
- Create: `apps/indy-content-studio/tests/dashboard-data-provider.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/dashboard-model.ts`

**Interfaces:**
- Consumes: `DashboardRepository`, `DashboardState`.
- Produces: `useDashboardData(): { state, status, error, mutate, reload }` and `upsertContent(state, item): DashboardState`.

- [ ] **Step 1: Write provider tests for load, mutation serialization, reload, and load error**

```tsx
render(<DashboardDataProvider repository={repository}><Probe /></DashboardDataProvider>);
expect(screen.getByRole("status")).toHaveTextContent("กำลังโหลดข้อมูล");
await screen.findByText("พร้อมใช้งาน");
await user.click(screen.getByRole("button", { name: "เพิ่มชิ้นงาน" }));
expect((await repository.read()).contents).toHaveLength(1);
```

The probe must also assert that two rapid `mutate` calls both survive and that a rejected `read()` exposes a Thai retry action.

- [ ] **Step 2: Run the provider test and verify failure**

Run: `pnpm test -- tests/dashboard-data-provider.test.tsx`

Expected: FAIL because the provider is missing.

- [ ] **Step 3: Implement the provider**

Queue mutation promises in call order:

```ts
type DashboardMutation = (current: DashboardState) => DashboardState;
mutate(mutation: DashboardMutation): Promise<void>;
```

Set `status` to `loading`, `ready`, or `error`. Subscribe after the first successful read and unsubscribe on unmount.

- [ ] **Step 4: Replace `initialTasks` with repository-backed content**

Map current `DashboardTask` display fields from `ContentItem` through a pure adapter. Creating or editing a task must call `mutate`; reloading the provider must preserve it. Keep the current drawer and Today workflow functional.

- [ ] **Step 5: Run focused and regression tests**

Run: `pnpm test -- tests/dashboard-data-provider.test.tsx tests/home-page.test.tsx tests/today-overview.test.tsx tests/task-detail-drawer.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run the job verification gate**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 7: Commit the shared data flow**

```bash
git add apps/indy-content-studio/app/page.tsx apps/indy-content-studio/features/data apps/indy-content-studio/features/dashboard apps/indy-content-studio/tests
git commit -m "feat: connect dashboard to shared persistent state"
```

### Human acceptance

1. Create a work item from the existing dashboard.
2. Reload the browser.
3. Confirm the item remains and opens in the drawer.
4. Open another dashboard tab, create a second item, and confirm a reload shows both.
5. Confirm no sample content is recreated after clearing the repository once.
