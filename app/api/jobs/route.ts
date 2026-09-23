import { NextRequest, NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json({ jobs: await listJobs() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const experience = typeof body.experience === "string" ? body.experience.trim() : "";
    const skills = Array.isArray(body.skills)
      ? body.skills.filter((skill: unknown): skill is string => typeof skill === "string")
          .map((skill: string) => skill.trim())
          .filter(Boolean)
      : [];

    if (!title || !description || !experience || skills.length === 0) {
      return NextResponse.json(
        { error: "Title, description, experience, and at least one skill are required" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { job: await createJob({ title, description, experience, skills }) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create job" },
      { status: 500 }
    );
  }
}