type LineWebhookEvent = {
  type?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

export function extractPairingEvent(
  event: LineWebhookEvent,
  pairingCode: string,
): { recipientUserId: string } | null {
  const expectedMessage = `เชื่อมต่อ ${pairingCode}`;

  if (
    event.type !== "message" ||
    event.source?.type !== "user" ||
    !event.source.userId ||
    event.message?.type !== "text" ||
    event.message.text?.trim() !== expectedMessage
  ) {
    return null;
  }

  return { recipientUserId: event.source.userId };
}
