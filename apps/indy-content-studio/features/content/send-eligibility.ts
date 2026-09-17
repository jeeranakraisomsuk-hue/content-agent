export type AssetState = "missing" | "uploading" | "ready";

export function canSendToLine({
  assetState,
  caption,
}: {
  assetState: AssetState;
  caption: string;
}): boolean {
  return assetState === "ready" && caption.trim().length > 0;
}
