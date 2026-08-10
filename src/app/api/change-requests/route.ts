import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { createChangeRequestSchema } from "@/validators/changeRequest";
import {
    createChangeRequest,
    listChangeRequests,
} from "@/services/changeRequestService";

export const dynamic = "force-dynamic";

/**
 * Dual-mode giong announcements/meetings: nhan vien (change_requests.read)
 * xem duoc danh sach nhan vien (mac dinh "staff", co the tu loc "mine"); nguoi
 * chi co change_requests.create (vd house_owner) chi duoc xem yeu cau CUA
 * CHINH MINH, bat ke ?view= truyen gi - ho khong co quyen xem yeu cau nguoi khac.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const isStaff = await userHasPermission(actorUser, "change_requests.read");
        if (!isStaff) {
            await requirePermission(actorUser, "change_requests.create");
        }
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const requestedView = searchParams.get("view");
        const status = searchParams.get("status") || undefined;

        const result = await listChangeRequests({
            page,
            limit,
            view: isStaff
                ? requestedView === "mine"
                    ? "mine"
                    : "staff"
                : "mine",
            status,
            actorUser,
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
        await requirePermission(actorUser, "change_requests.create");
        const body = createChangeRequestSchema.parse(await req.json());
        const changeRequest = await createChangeRequest(actorUser, body);
        return apiSuccess(changeRequest, "Gui yeu cau thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
