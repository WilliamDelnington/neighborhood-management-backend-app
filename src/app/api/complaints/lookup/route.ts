import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { getComplaintByCode } from "@/services/complaintService";

export const dynamic = "force-dynamic";

/**
 * Tra cuu cong khai theo ma phan anh (HB-PA-YYYY-0001), khong yeu cau dang nhap.
 * Chi tra ve du lieu cong khai (an internalNotes va cac moc thoi gian noi bo).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const code = searchParams.get("code");
        if (!code) return apiErrorFromException(new Error("Thieu ma phan anh"));
        const result = await getComplaintByCode(code);
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
