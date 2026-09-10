import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission, requireAnyPermission } from "@/lib/rbac";
import { EXPORT_CITIZEN_REPORT_PERMISSION_KEYS } from "@/lib/permissionRegistry";
import { createCitizenSchema } from "@/validators/citizen";

export const dynamic = "force-dynamic";
import { createCitizen, listCitizens } from "@/services/citizenService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "citizens.create");

        const body = createCitizenSchema.parse(await req.json());
        const citizen = await createCitizen(user, body);
        return apiSuccess(citizen, "Thêm nhân khẩu thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        // Cho phep nguoi chi duoc cap 1 trong cac quyen
        // "reports.export_citizens.*" (rieng cho man Xuat bao cao) truy cap
        // danh sach nay ma khong bat buoc phai co ca quyen "citizens.read"
        // day du (quyen do con gate ca man Nhan khau/CRUD).
        await requireAnyPermission(user, [
            "citizens.read",
            ...EXPORT_CITIZEN_REPORT_PERMISSION_KEYS,
        ]);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listCitizens({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            householdId: searchParams.get("householdId") || undefined,
            neighborhoodId: searchParams.get("neighborhoodId") || undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
