import { HttpError } from "@/lib/response";

type Bucket = { count: number; resetAt: number };

/**
 * Gioi han so lan thu trong 1 khoang thoi gian, luu trong bo nho tien trinh (khong
 * dung Redis vi he thong hien chi chay 1 instance). Dung cho dang nhap bang mat khau
 * de chong brute-force - khong ap dung cho dang nhap Zalo (da xac thuc qua OAuth).
 */
export function createRateLimiter(maxAttempts: number, windowMs: number) {
    const buckets = new Map<string, Bucket>();

    return {
        check(key: string): void {
            const now = Date.now();
            const bucket = buckets.get(key);
            if (!bucket || bucket.resetAt <= now) {
                buckets.set(key, { count: 1, resetAt: now + windowMs });
                return;
            }
            if (bucket.count >= maxAttempts) {
                throw new HttpError(
                    "Ban da thu qua nhieu lan, vui long thu lai sau it phut",
                    429,
                );
            }
            bucket.count += 1;
        },
        reset(key: string): void {
            buckets.delete(key);
        },
    };
}

export const loginRateLimiter = createRateLimiter(5, 15 * 60 * 1000);
