import { getLineReview, listLineReviews } from "../../../../features/line-oa/server/line-review-store";

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("reviewCode");
  const reviews = code ? (getLineReview(code) ? [getLineReview(code)] : []) : listLineReviews();
  return Response.json({ reviews });
}
