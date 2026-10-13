export function GET() {
  return new Response("google-site-verification: googlea735d44a786fccc9.html", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
