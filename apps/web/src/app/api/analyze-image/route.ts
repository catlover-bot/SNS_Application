import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/imageAnalysis";

export const runtime = "nodejs"; // sharp を使うので edge ではなく node

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

    const array = Buffer.from(await file.arrayBuffer());
    const result = await analyzeImage(array);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
