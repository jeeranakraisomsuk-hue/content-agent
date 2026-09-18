import { getIntegrationHealth } from "../../../../features/integrations/server/integration-health";

export async function GET(): Promise<Response> {
  return Response.json({ integrations: await getIntegrationHealth() });
}
