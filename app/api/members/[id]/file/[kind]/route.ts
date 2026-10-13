import { authorize } from "@/lib/auth/guard";
import { getEnv } from "@/lib/db";
import { getMember } from "@/lib/membership/server";

/**
 * The only way a member's photo or payment slip leaves storage. The caller names
 * a member and which of their files — never a storage key — so there is nothing
 * to tamper with, and only someone who may manage members gets an answer.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/members/[id]/file/[kind]">) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;

  const { id, kind } = await params;
  const member = await getMember(id);
  const key = !member ? null : kind === "photo" ? member.photoKey : kind === "slip" ? member.paymentSlipKey : kind === "renewal-slip" && member.renewalStatus === "pending" ? member.renewal?.slipKey : null;
  const object = key ? await getEnv().MEDIA.get(key) : null;
  if (!object) return new Response("Not found", { status: 404 });

  const type = object.httpMetadata?.contentType ?? "application/octet-stream";
  return new Response(object.body, {
    headers: {
      "Content-Type": type,
      // Personal documents: never stored by a shared cache and never sniffed. An image opens in the
      // browser with scripting shut off; a PDF is handed over as a download rather than run on this origin.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Content-Disposition": type.startsWith("image/") ? "inline" : `attachment; filename="${kind}.pdf"`,
    },
  });
}
