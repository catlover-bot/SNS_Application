import { NextResponse } from "next/server";
import { analyzeImage } from "@/lib/imageAnalysis";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const maybeFile = formData.get("file");

    if (!(maybeFile instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file is required" },
        { status: 400 }
      );
    }

    if (maybeFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: "file is too large (max 10MB)" },
        { status: 413 }
      );
    }

    const arrayBuffer = await maybeFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await analyzeImage(buffer);

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "analyze failed" },
      { status: 500 }
    );
  }
}
