import type { ContentItem, DashboardState, Platform, PlatformSchedule, PublicationAttempt } from "../../domain/types";
import { createProviderMediaDeliveryUrls } from "../../media/server/media-delivery-url";
import { buildPublicationIdempotencyKey } from "../publication-eligibility";

type Environment = Readonly<Record<string, string | undefined>>;

export type MakePublicationPayload = {
  attemptId: string;
  idempotencyKey: string;
  contentId: string;
  title: string;
  platform: Platform;
  publishAt: string;
  caption: string;
  callbackUrl: string;
  media: Array<{ assetId: string; name: string; mimeType: string; originalContentUrl: string; previewImageUrl?: string }>;
};

export function buildMakePublicationPayload({ state, content, platform, schedule, attemptId, callbackUrl, environment = process.env, now = () => Math.floor(Date.now() / 1_000) }: {
  state: DashboardState;
  content: ContentItem;
  platform: Platform;
  schedule: PlatformSchedule;
  attemptId: string;
  callbackUrl: string;
  environment?: Environment;
  now?: () => number;
}): MakePublicationPayload {
  if (!schedule.publishAt) throw new Error("ยังไม่ได้กำหนดเวลาลง");
  const media = content.assetIds.map((assetId) => {
    const asset = state.media.find((item) => item.id === assetId && !item.deletedAt);
    if (!asset || asset.remoteStatus !== "ready") throw new Error("สื่อยังไม่พร้อมใช้งานจาก storage");
    if (asset.providerFileId) {
      const urls = createProviderMediaDeliveryUrls({ providerFileId: asset.providerFileId, previewProviderFileId: asset.previewProviderFileId ?? asset.providerFileId, environment, now });
      return { assetId, name: asset.name, mimeType: asset.mimeType, originalContentUrl: urls.originalContentUrl, previewImageUrl: urls.previewImageUrl };
    }
    if (asset.source === "external" && asset.externalUrl) return { assetId, name: asset.name, mimeType: asset.mimeType, originalContentUrl: asset.externalUrl, previewImageUrl: asset.externalPreviewUrl ?? undefined };
    throw new Error("สื่อยังไม่มี URL สำหรับส่ง Make");
  });
  return { attemptId, idempotencyKey: buildPublicationIdempotencyKey(content, platform, schedule), contentId: content.id, title: content.title, platform, publishAt: schedule.publishAt, caption: content.caption.trim(), callbackUrl, media };
}

export type PublicationResultInput = Pick<PublicationAttempt, "id" | "status" | "providerPublicationId" | "receiptUrl" | "errorCode">;

export function applyPublicationResult(state: DashboardState, input: PublicationResultInput, now: string): DashboardState {
  const current = state.publicationAttempts.find((attempt) => attempt.id === input.id);
  if (!current) throw new Error("ไม่พบรายการเผยแพร่");
  if (current.status === "published" || (current.status === "cancelled" && input.status !== "cancelled")) return state;
  if (input.status === "publishing" && !["submitting", "queued", "publishing"].includes(current.status)) return state;
  if (input.status === "published" && !input.providerPublicationId && !input.receiptUrl) throw new Error("ผล published ต้องมีหลักฐานจากผู้ให้บริการ");
  const next: DashboardState = {
    ...state,
    publicationAttempts: state.publicationAttempts.map((attempt) => attempt.id === input.id ? { ...attempt, status: input.status, providerPublicationId: input.providerPublicationId ?? attempt.providerPublicationId, receiptUrl: input.receiptUrl ?? attempt.receiptUrl, errorCode: input.errorCode ?? null, updatedAt: now } : attempt),
  };
  if (input.status !== "cancelled") return next;
  return {
    ...next,
    contents: next.contents.map((content) => content.id !== current.contentId ? content : { ...content, schedules: content.schedules.map((schedule) => schedule.platform === current.platform && schedule.latestAttemptId === current.id ? { ...schedule, latestAttemptId: null } : schedule), updatedAt: now }),
  };
}
