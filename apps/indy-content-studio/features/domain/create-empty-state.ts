import type {
  Category,
  DashboardState,
  FormatDefinition,
  IntegrationStatus,
  Platform,
} from "./types";

const allPlatforms: Platform[] = ["facebook", "instagram", "tiktok"];

function createCategories(): Category[] {
  return [
    { id: "category-knowledge", name: "ความรู้", requiresApproval: false },
    { id: "category-review", name: "รีวิว", requiresApproval: false },
    { id: "category-atmosphere", name: "บรรยากาศ", requiresApproval: false },
  ];
}

function createFormats(): FormatDefinition[] {
  return [
    { id: "format-video", name: "วิดีโอ", mediaKind: "video", allowedPlatforms: allPlatforms },
    { id: "format-image", name: "ภาพเดี่ยว", mediaKind: "image", allowedPlatforms: ["facebook"] },
    { id: "format-album", name: "อัลบั้ม", mediaKind: "image", allowedPlatforms: ["facebook"] },
    { id: "format-legacy", name: "เป้าเดิม — ยังไม่แบ่งรูปแบบ", mediaKind: "other", allowedPlatforms: ["facebook"] },
  ];
}

function createIntegrations(): IntegrationStatus[] {
  return [
    "google-sheets",
    "google-drive",
    "line",
    "make",
    "tiktok",
    "online-media",
    "ai-caption",
  ].map((provider) => ({
    provider: provider as IntegrationStatus["provider"],
    status: "disconnected",
    checkedAt: null,
    message: "ยังไม่ได้เชื่อมต่อ",
  }));
}

export function createEmptyDashboardState(): DashboardState {
  return {
    schemaVersion: 1,
    contents: [],
    media: [],
    categories: createCategories(),
    formats: createFormats(),
    references: [],
    captionTemplates: [],
    corrections: [],
    monthlyGoals: [],
    publicationAttempts: [],
    integrations: createIntegrations(),
    notificationReadIds: [],
  };
}
