type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type LineMessage = { type: "text"; text: string } | {
  type: "image" | "video";
  originalContentUrl: string;
  previewImageUrl: string;
};

export async function pushLineMessages({
  fetcher,
  accessToken,
  recipientUserId,
  retryKey,
  messages,
}: {
  fetcher: Fetcher;
  accessToken: string;
  recipientUserId: string;
  retryKey: string;
  messages: LineMessage[];
}): Promise<{ status: "sent" }> {
  const response = await fetcher("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({ to: recipientUserId, messages }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("LINE configuration rejected the request");
  }

  if (!response.ok) {
    throw new Error("LINE delivery failed");
  }

  return { status: "sent" };
}
