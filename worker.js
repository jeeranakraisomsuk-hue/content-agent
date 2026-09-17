const encoder = new TextEncoder();

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function isValidSignature(rawBody, receivedSignature, channelSecret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return toBase64(new Uint8Array(signature)) === receivedSignature;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/line/webhook") {
      return new Response("INDY LINE OA test webhook is active", { status: 200 });
    }

    if (request.method !== "POST" || !env.LINE_CHANNEL_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-line-signature") ?? "";
    const isValid = await isValidSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);

    return new Response(isValid ? "OK" : "Unauthorized", { status: isValid ? 200 : 401 });
  },
};
