type ImageMedia = {
  kind: "image";
  originalUrl: string;
  previewUrl: string;
};

type DocumentMedia = {
  kind: "document";
  downloadUrl: string;
};

type VideoMedia = {
  kind: "video";
  originalUrl: string;
  previewUrl: string;
};

type LineMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string }
  | { type: "video"; originalContentUrl: string; previewImageUrl: string };

export function buildLineMessages({
  media,
  caption,
}: {
  media: ImageMedia | VideoMedia | DocumentMedia;
  caption: string;
}): LineMessage[] {
  if (media.kind === "document") {
    return [{ type: "text", text: `${caption}\nดาวน์โหลดไฟล์: ${media.downloadUrl}` }];
  }

  const visual = media.kind === "image"
    ? { type: "image" as const, originalContentUrl: media.originalUrl, previewImageUrl: media.previewUrl }
    : { type: "video" as const, originalContentUrl: media.originalUrl, previewImageUrl: media.previewUrl };

  return [visual, { type: "text", text: caption }];
}
