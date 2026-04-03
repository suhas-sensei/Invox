import { NextRequest, NextResponse } from "next/server";
import { getInvoices, getEmployeeInvoices } from "@/lib/contract";

export async function GET(request: NextRequest) {
  const employee = request.nextUrl.searchParams.get("employee");

  try {
    const invoices = employee
      ? await getEmployeeInvoices(employee)
      : await getInvoices();

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Invoice list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}
