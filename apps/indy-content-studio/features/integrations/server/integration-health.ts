import type { IntegrationStatus } from "../../domain/types";

export type IntegrationHealth = Pick<IntegrationStatus, "provider" | "status" | "checkedAt" | "message">;
export type IntegrationHealthCheck = {
  provider: IntegrationStatus["provider"];
  check: () => Promise<boolean>;
};

const providerEnv: Record<IntegrationStatus["provider"], string[]> = {
  "google-sheets": ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"],
  "google-drive": ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_DRIVE_FOLDER_ID"],
  line: ["LINE_CHANNEL_SECRET"],
  make: ["MAKE_API_TOKEN"],
  tiktok: ["TIKTOK_ACCESS_TOKEN"],
  "online-media": ["ONLINE_MEDIA_API_KEY"],
  "ai-caption": ["AI_CAPTION_API_KEY"],
};

export const integrationProviders = Object.keys(providerEnv) as IntegrationStatus["provider"][];

export function defaultIntegrationHealthChecks(env: NodeJS.ProcessEnv = process.env): IntegrationHealthCheck[] {
  return integrationProviders.map((provider) => ({
    provider,
    check: async () => providerEnv[provider].every((name) => Boolean(env[name])),
  }));
}

export async function getIntegrationHealth(checks: IntegrationHealthCheck[] = defaultIntegrationHealthChecks()): Promise<IntegrationHealth[]> {
  const checkedAt = new Date().toISOString();
  return Promise.all(checks.map(async ({ provider, check }) => {
    try {
      const connected = await check();
      return {
        provider,
        status: connected ? "connected" : "disconnected",
        checkedAt,
        message: connected ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ",
      } satisfies IntegrationHealth;
    } catch {
      return {
        provider,
        status: "error",
        checkedAt,
        message: "ตรวจการเชื่อมต่อไม่สำเร็จ",
      } satisfies IntegrationHealth;
    }
  }));
}
