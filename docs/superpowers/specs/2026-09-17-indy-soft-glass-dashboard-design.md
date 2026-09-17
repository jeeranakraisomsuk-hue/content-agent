# INDY Content Studio soft-glass dashboard redesign

## Status

Approved visual direction and interaction model. This document defines the redesign before implementation. It does not authorize deployment over the existing live dashboard or changes to LINE channel settings.

## Goal

Rebuild INDY Content Studio as a desktop-first content-production dashboard with an iPhone-inspired soft-glass visual system. The primary landing surface is an overview of today's work, ordered by priority. Existing business capabilities remain available while the interface is redesigned.

## Design direction

The visual reference is warm, tactile iPhone-style glass: a quiet oatmeal backdrop, translucent off-white panels, soft blur, large rounded corners, and restrained shadows. It should feel premium and calm, not like a smart-home clone.

### Tokens

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#E7DDD1` | Warm background and ambient depth |
| Glass | `rgba(246,243,238,0.68)` | Panels, drawers, and modal surfaces |
| Ink | `#2D2A27` | Headings and core controls |
| Sage | `#879C81` | Primary continuation and healthy status |
| Coral | muted coral | Urgent priority only |
| Border | translucent white | Glass edge definition |

Typography remains legible in Thai at dashboard density. Labels use sentence case; icon-only controls receive accessible names and hover/focus tooltips.

## Information architecture

The left rail is permanently narrow and icon-led. Its labels appear on hover or keyboard focus so the workspace remains visually open. It routes to:

1. Overview
2. Content calendar
3. Production board
4. Media library
5. Review and corrections
6. References and templates
7. Connections and settings

The first route is always **Today overview**.

## Today overview

The central glass workspace is the primary surface. The leading heading is `กำหนดการวันนี้`.

- Tasks are ordered by priority, then due time.
- Every task card presents: thumbnail, work title, scheduled time, status pill, urgency treatment, and contextual actions.
- The primary call to action is `ทำงานล่าสุดต่อ`; it resumes the latest unfinished workflow at its exact stage.
- A secondary right column contains a compact calendar, count of pending approvals, and a LINE delivery readiness card.
- The overview must remain useful in empty, loading, error, and no-scheduled-work states.

## Work interaction model

Selecting an existing task opens a right-side **glass detail drawer**. The overview stays visible behind it, preserving orientation.

The drawer contains the task's production state, asset list, caption, metadata, process steps, platform schedule, review state, and delivery actions. It must preserve unsaved edits and communicate save/error/submission state clearly.

Creating a new task opens a centered **glass modal**. It is intentionally more focused than the drawer and collects title, category, format, owner, objective, file(s), caption, schedule, and notes. The modal uses progressive sections so it stays calm rather than becoming a long generic form.

## LINE delivery experience

`ส่งเข้า LINE OA` is enabled only when the task includes at least one eligible asset and a non-empty caption.

On click, a short centered confirmation glass modal shows:

- selected file name and preview;
- a caption preview;
- intended recipient: `PRIK GN`;
- explicit `ยืนยันส่ง` and `ยกเลิก` controls.

After a successful submission, the task records a visible receipt and updates delivery status. A failed delivery explains the outcome and allows a safe retry. No actual LINE push is enabled until the correct INDY OS Alerts channel, webhook, secret, token, and recipient pairing have been configured and verified separately.

## Existing capability coverage

The redesign retains the existing functional scope:

- content creation and editing;
- priority and production workflow states;
- calendar and scheduling;
- automated posting configuration: platforms, publish date/time, Make readiness, and publication receipt status;
- media upload, asset selection, and library browsing;
- caption templates and references;
- review rounds, feedback, and corrections;
- integrations, automation readiness, and settings;
- LINE review/delivery as a guarded workflow.

The redesign may consolidate navigation and presentation, but it must not silently drop an existing capability.

## Responsive and accessibility rules

The first release is desktop-first. Tablet/mobile may provide an overview and limited review capability, but production editing and delivery are optimized for desktop.

- Rail labels appear on hover and keyboard focus.
- Glass panels maintain text contrast; blur never becomes the sole separation mechanism.
- All actions have visible keyboard focus, semantic labels, and state-specific feedback.
- Reduced-motion preferences remove decorative transitions.

## Implementation boundaries

- Work occurs in the isolated reconstructed-source worktree.
- The deployed orange dashboard remains untouched until a later explicit deployment approval.
- No GitHub push occurs until the requested implementation is complete and the user explicitly asks for it.
- No LINE Developers setting is changed as part of this UI redesign.

## Verification

Implementation will be test-first for behavior changes, then verified by:

1. component and workflow tests for guarded actions;
2. state coverage for loading, empty, error, disabled, focus, submission, and success cases;
3. browser visual review against this approved design direction;
4. a UI-guideline audit for accessibility, performance, and interaction quality.
