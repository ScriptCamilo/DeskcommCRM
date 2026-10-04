import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { requireSupportWrite } from "@/lib/impersonate/support";
import { uploadConversationMediaForMobile } from "@/lib/mobile/upload-conversation-media";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const { id } = await params;
  return uploadConversationMediaForMobile(request, id, randomUUID(), "note");
}
