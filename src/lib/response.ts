import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ApiResponse } from "@/types";

export function apiSuccess<T>(
    data?: T,
    message?: string,
    status = 200,
): NextResponse<ApiResponse<T>> {
    return NextResponse.json({ success: true, data, message }, { status });
}

export function apiError(
    error: string,
    status = 400,
    message?: string,
): NextResponse<ApiResponse<never>> {
    return NextResponse.json(
        { success: false, error, message: message || error },
        { status },
    );
}

export function apiErrorFromException(
    err: unknown,
): NextResponse<ApiResponse<never>> {
    if (err instanceof ZodError) {
        const first = err.issues[0];
        return apiError(
            first
                ? `${first.path.join(".")}: ${first.message}`
                : "Du lieu khong hop le",
            422,
        );
    }
    if (err instanceof HttpError) {
        return apiError(err.message, err.status);
    }
    console.error(err);
    return apiError("Da xay ra loi he thong", 500);
}

export class HttpError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

export function paginationParams(searchParams: URLSearchParams) {
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(
        100,
        Math.max(1, Number(searchParams.get("limit")) || 20),
    );
    return { page, limit, skip: (page - 1) * limit };
}
