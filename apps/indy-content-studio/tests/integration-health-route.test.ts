import { describe, expect, it } from "vitest";
import { GET } from "../app/api/integrations/health/route";
import { getIntegrationHealth } from "../features/integrations/server/integration-health";

describe("integration health", () => {
  it("returns safe disconnected status without leaking configuration", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.integrations).toContainEqual(expect.objectContaining({ provider: "google-sheets", status: "disconnected" }));
    expect(JSON.stringify(payload)).not.toContain("GOOGLE_PRIVATE_KEY");
    expect(JSON.stringify(payload)).not.toContain("secret-value");
  });

  it("sanitizes provider failures", async () => {
    const [result] = await getIntegrationHealth([{ provider: "make", check: async () => { throw new Error("secret-value"); } }]);
    expect(result).toMatchObject({ provider: "make", status: "error", message: "ตรวจการเชื่อมต่อไม่สำเร็จ" });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });
});
