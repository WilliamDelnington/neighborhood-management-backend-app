import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { getSessionFromRequest } from "@/lib/auth";
import { requireUser, requireRole } from "@/lib/rbac";
import { createFileAssetSchema } from "@/validators/fileAsset";

export const dynamic = "force-dynamic";
import {
    createFileAsset,
    listFileAssets,
    STAFF_ROLES_FOR_FILE_ASSETS,
} from "@/services/fileAssetService";

// GET la endpoint cong khai (nguoi dan xem "Bieu mau" khong can dang nhap).
// Neu co session hop le voi role duoc phep quan ly file va truyen ?admin=1,
// tra ve toan bo danh sach (ca file chua cong khai) cho man hinh quan tri.
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);

        const session = getSessionFromRequest(req);
        const isStaff =
            !!session &&
            session.roles.some(r =>
                (STAFF_ROLES_FOR_FILE_ASSETS as readonly string[]).includes(r),
            );
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
        requireRole(actorUser, ...STAFF_ROLES_FOR_FILE_ASSETS);

        const body = createFileAssetSchema.parse(await req.json());
        const fileAsset = await createFileAsset(String(actorUser._id), body);
        return apiSuccess(fileAsset, "Them file thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
