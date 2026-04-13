// ============================================================
// QUANT EDGE — API Error Handling Utility
// Wraps API route handlers with consistent error handling
// ============================================================

import { NextResponse } from "next/server";

export function apiError(message: string, status: number = 500, details?: string) {
  console.error(`API Error: ${message}`, details || "");
  return NextResponse.json(
    { error: message, details: details || undefined },
    { status }
  );
}

export async function withErrorHandling<T>(
  handler: () => Promise<T>,
  errorMessage: string = "Internal server error"
): Promise<T | NextResponse> {
  try {
    return await handler();
  } catch (error: any) {
    return apiError(errorMessage, 500, error?.message);
  }
}
