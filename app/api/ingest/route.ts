export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest) {
  try {
    // TODO: Implement ingestion pipeline (parse, chunk, embed, insert)
    return NextResponse.json({
      error: "Not implemented",
    }, { status: 501 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
