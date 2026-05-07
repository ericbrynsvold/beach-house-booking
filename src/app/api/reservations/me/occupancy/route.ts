import { NextResponse } from "next/server";
import { getGuestEmailFromRequest } from "@/lib/api-auth";
import { queryOccupancyForMonth } from "@/lib/occupancy-data";

/** Same data as /api/occupancy, but authorized with a guest JWT (no site passphrase). */
export async function GET(request: Request) {
  const email = await getGuestEmailFromRequest(request);
  if (!email) {
    return NextResponse.json({ error: "Guest token required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));
  if (!month || !year || month < 1 || month > 12) {
    return NextResponse.json({ error: "month and year required" }, { status: 400 });
  }

  const data = await queryOccupancyForMonth(year, month);
  return NextResponse.json(data);
}
