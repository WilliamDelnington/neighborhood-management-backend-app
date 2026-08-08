import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { searchResidentUsers } from "@/services/userService";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/search-residents?search=
 * Tim chu ho theo ten/so dien thoai - dung cho man chon "nguoi nhan cu the"
 * khi gui Thong bao. Truyen ?ids=a,b,c thay vi search de "resolve nguoc" mot
 * danh sach id da luu san (vd hien lai chip khi sua Thong bao).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requireAnyPermission(actorUser, [
            "announcements.create",
            "announcements.update",
        ]);
        const { searchParams } = new URL(req.url);
        const idsRaw = searchParams.get("ids");
        const ids = idsRaw
            ? idsRaw.split(",").map(v => v.trim()).filter(Boolean)
            : undefined;
        const users = await searchResidentUsers(
            searchParams.get("search") || "",
            ids,
        );
        return apiSuccess(users);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
