import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import {
    getHouseInspectionSelfDeclaration,
    saveHouseInspectionSelfDeclaration,
} from "@/services/inspectionService";
import { houseInspectionSelfDeclarationSchema } from "@/validators/inspection";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { targetId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        return apiSuccess(
            await getHouseInspectionSelfDeclaration(actorUser, params.targetId),
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { targetId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = houseInspectionSelfDeclarationSchema.parse(await req.json());
        return apiSuccess(
            await saveHouseInspectionSelfDeclaration(actorUser, params.targetId, input),
            "Đã lưu bản nháp tự khai",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
