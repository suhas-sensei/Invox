import { NextResponse } from "next/server";
import { getEmployeeReceipts } from "@/lib/contract";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const employee = url.searchParams.get("employee");
  if (!employee) return NextResponse.json({ error: "employee required" }, { status: 400 });

  try {
    const receipts = await getEmployeeReceipts(employee);
    return NextResponse.json({ receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch receipts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
