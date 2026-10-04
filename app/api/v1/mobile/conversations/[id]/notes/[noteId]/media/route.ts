import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { urlDeMidiaDaConversaParaMobile } from "@/lib/mobile/url-de-midia-da-conversa";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
): Promise<Response> {
  const { id, noteId } = await params;
  return urlDeMidiaDaConversaParaMobile(request, id, noteId, randomUUID(), "note");
}
