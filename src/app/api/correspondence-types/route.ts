import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createCorrespondenceTypeSchema } from "@/validators/correspondenceType";
import {
    createCorrespondenceType,
    listCorrespondenceTypes,
} from "@/services/correspondenceTypeService";

export const dynamic = "force-dynamic";

/**
 * GET: mac dinh doi hoi correspondence_types.read (admin - quan tri danh muc).
 * ?eligibleSender=1 ha thap xuong correspondence_types.read HOAC correspondences.create
 * va tu dong loc allowedSenderRoles theo vai tro cua chinh actorUser - dung cho
 * bo chon loai van ban khi soan (bat ky ai duoc gui MOT loai nao do can thay
 * duoc danh sach, khong chi admin).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const { searchParams } = new URL(req.url);
        const eligibleSender = searchParams.get("eligibleSender") === "1";

        if (!eligibleSender) {
            await requirePermission(actorUser, "correspondence_types.read");
        }

        const search = searchParams.get("search") || undefined;
        const activeParam = searchParams.get("active");
        const active =
            activeParam === null
                ? eligibleSender
                    ? true
                    : undefined
                : activeParam === "1" || activeParam === "true";
        const { page, limit } = paginationParams(searchParams);

        const result = await listCorrespondenceTypes({
            search,
            active,
            eligibleSenderRoles: eligibleSender ? actorUser.roles : undefined,
            page,
            limit,
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
        await requirePermission(actorUser, "correspondence_types.create");

        const body = createCorrespondenceTypeSchema.parse(await req.json());
        const type = await createCorrespondenceType(
            String(actorUser._id),
            body,
        );
        return apiSuccess(type, "Tao loai van ban thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
