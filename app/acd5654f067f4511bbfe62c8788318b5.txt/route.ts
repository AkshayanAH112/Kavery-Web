export function GET() {
  return new Response("acd5654f067f4511bbfe62c8788318b5", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
