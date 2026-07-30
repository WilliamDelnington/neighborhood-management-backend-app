import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const corsOrigin =
    process.env.NODE_ENV === "production"
        ? process.env.CORS_ORIGIN || "https://hiscustom.io.vn"
        : "*";

/**
 * Next.js App Router route files chi tra loi cac HTTP method chung export
 * (GET/POST/...), nen preflight OPTIONS se bi 405 mac dinh du next.config.mjs
 * da gan header CORS cho response that su. Trinh duyet huy request that su
 * neu preflight khong tra ve 2xx, nen middleware nay chan rieng OPTIONS truoc
 * khi toi route handler va tra ve 204 kem day du header CORS can thiet.
 */
export function middleware(req: NextRequest) {
    if (req.method === "OPTIONS") {
        return new NextResponse(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": corsOrigin,
                "Access-Control-Allow-Methods":
                    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    }
    return NextResponse.next();
}

export const config = {
    matcher: "/api/:path*",
};
