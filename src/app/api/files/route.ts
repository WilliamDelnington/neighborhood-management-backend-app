import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
    HttpError,
} from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";
import {
    createFileAssetSchema,
    createFileAssetUploadMetaSchema,
} from "@/validators/fileAsset";

export const dynamic = "force-dynamic";
import {
    createFileAsset,
    createFileAssetFromUpload,
    listFileAssets,
} from "@/services/fileAssetService";

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
        // File tai len truc tiep co url tuong doi ("/uploads/..."); can chuyen
        // ve tuyet doi vi endpoint nay duoc goi ca tu Mini App (khong co helper
        // resolveAssetUrl phia client nhu admin web).
        const origin = getPublicOrigin(req);
        result.items.forEach(item => {
            item.url = toAbsoluteUploadUrl(item.url, origin);
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

        // Client gui multipart/form-data khi tai file nhi phan len truc tiep
        // (xem uploadFileAsset o frontend); nguoc lai la JSON voi url co san.
        const contentType = req.headers.get("content-type") || "";
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file");
            if (!(file instanceof File)) {
                throw new HttpError("Thieu file can tai len", 400);
            }
            const meta = createFileAssetUploadMetaSchema.parse({
                name: formData.get("name") || undefined,
                description: formData.get("description") || undefined,
                category: formData.get("category") || undefined,
                isPublic: formData.get("isPublic") === "true",
                audienceAll: formData.get("audienceAll") !== "false",
                targetRoles: formData.getAll("targetRoles").map(String),
            });
            const fileAsset = await createFileAssetFromUpload(
                String(actorUser._id),
                file,
                meta,
            );
            return apiSuccess(fileAsset, "Them file thanh cong", 201);
        }

        const body = createFileAssetSchema.parse(await req.json());
        const fileAsset = await createFileAsset(String(actorUser._id), body);
        return apiSuccess(fileAsset, "Them file thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
