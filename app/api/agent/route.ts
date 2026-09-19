export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest) {
  try {
    // TODO: Implement tool-calling agent loop with generateText and final generateObject
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
