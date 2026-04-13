import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

// GET — fetch all settings + account state
export async function GET() {
  try {
    const db = getSupabaseServer();

    const [settingsRes, accountRes] = await Promise.all([
      db.from("settings").select("*"),
      db.from("account_state").select("*").limit(1).single(),
    ]);

    if (settingsRes.error) return NextResponse.json({ error: settingsRes.error.message }, { status: 500 });

    // Convert settings rows to key-value object
    const settings: Record<string, string> = {};
    for (const row of settingsRes.data || []) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({
      settings,
      balance: accountRes.data?.balance || 500,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — update settings and/or balance
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getSupabaseServer();

    // Update balance if provided
    if (body.balance !== undefined) {
      const { error } = await db
        .from("account_state")
        .update({ balance: body.balance, updated_at: new Date().toISOString() })
        .not("id", "is", null); // update all rows (there's only one)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update settings if provided
    if (body.settings) {
      for (const [key, value] of Object.entries(body.settings)) {
        const { error } = await db
          .from("settings")
          .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
