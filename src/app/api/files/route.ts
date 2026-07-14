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
// bo danh sach (ca file chua cong khai) cho man hinh quan tri.
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);

        let isStaff = false;
        try {
            const actorUser = await requireUser(req);
            isStaff = await userHasPermission(actorUser, "files.read");
        } catch {
            isStaff = false;
        }
        const wantsAdminView = searchParams.get("admin") === "1";
        const publicOnly = !(isStaff && wantsAdminView);

        const result = await listFileAssets({
            page,
            limit,
            category: searchParams.get("category") || undefined,
            publicOnly,
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
