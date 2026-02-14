import { NextResponse } from "next/server";
import { validateInputs, computeNGuard } from "@/lib/nguard";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const inputs = validateInputs(raw);
    const outputs = computeNGuard(inputs);
    return NextResponse.json(outputs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
