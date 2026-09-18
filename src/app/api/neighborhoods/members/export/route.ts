import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException } from "@/lib/response";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { requireUser, requirePermission } from "@/lib/rbac";
import { exportAllNeighborhoodMembers } from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "neighborhoods.manage");

        const workbook = await exportAllNeighborhoodMembers();
        return await workbookToXlsxResponse(
            workbook,
            "thanh-vien-to-dan-pho.xlsx",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
