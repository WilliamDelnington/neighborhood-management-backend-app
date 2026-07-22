import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { createFileAssetSchema } from "@/validators/fileAsset";

export const dynamic = "force-dynamic";
import { createFileAsset, listFileAssets } from "@/services/fileAssetService";

// GET la endpoint cong khai (nguoi dan xem "Bieu mau" khong can dang nhap).
// Neu co session hop le voi quyen files.read va truyen ?admin=1, tra ve toan
// bo danh sach (ca file chua cong khai, khong loc theo doi tuong) cho man hinh
// quan tri. Nguoc lai (nguoi dan xem trong Mini App), ket qua duoc loc them
// theo targetRoles/audienceAll dua tren role cua nguoi dang nhap (hoac chi
// audienceAll=true neu chua dang nhap).
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);

        let actorUser = null;
        try {
            actorUser = await requireUser(req);
        } catch {
            actorUser = null;
        }
        const isStaff = actorUser
            ? await userHasPermission(actorUser, "files.read")
            : false;
        const wantsAdminView = searchParams.get("admin") === "1";
        const isAdminView = isStaff && wantsAdminView;
        const publicOnly = !isAdminView;
        const viewerRoles = isAdminView ? null : actorUser?.roles || [];

        const result = await listFileAssets({
            page,
            limit,
            category: searchParams.get("category") || undefined,
            publicOnly,
            viewerRoles,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "files.create");

        const body = createFileAssetSchema.parse(await req.json());
        const fileAsset = await createFileAsset(String(actorUser._id), body);
        return apiSuccess(fileAsset, "Them file thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
