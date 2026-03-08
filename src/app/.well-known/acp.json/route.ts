import { NextRequest, NextResponse } from "next/server";
import {
  ACP_DISCOVERY_CACHE_CONTROL,
  createAcpDiscoveryResponse,
} from "@/lib/acp";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  return NextResponse.json(createAcpDiscoveryResponse(request), {
    headers: {
      "Cache-Control": ACP_DISCOVERY_CACHE_CONTROL,
    },
  });
}