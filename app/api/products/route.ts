import type { NextRequest } from "next/server";
import { listDirectory } from "@/lib/guides";

// GET ?q=&level=&status=&managed= → directory entries
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.toLowerCase();
  const level = p.get("level");
  const status = p.get("status");
  const managed = p.get("managed");
  const items = (await listDirectory()).filter(
    (e) =>
      (!q || e.productName.toLowerCase().includes(q) || e.slug.includes(q)) &&
      (!level || String(e.level) === level) &&
      (!status || e.status === status) &&
      (!managed || String(e.managedAuth) === managed),
  );
  return Response.json({ items });
}
