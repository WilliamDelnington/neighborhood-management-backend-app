import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateCorrespondenceSchema } from "@/validators/correspondence";
import type { ICorrespondenceType } from "@/models";
import {
    assertCorrespondenceInScope,
    getCorrespondenceById,
    updateCorrespondence,
} from "@/services/correspondenceService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "correspondences.read");
        // getCorrespondenceById tra ve doc da populate correspondenceTypeId -
        // scope thuc su duoc kiem trong updateCorrespondence/... cho cac thao
        // tac khac; o day GET chi tu choi neu khong phai admin/nguoi
        // gui/nguoi nhan hop le, xem assertCorrespondenceInScope.
        const correspondence = await getCorrespondenceById(params.id);
        assertCorrespondenceInScope(
            actorUser,
            correspondence,
            correspondence.correspondenceTypeId as unknown as ICorrespondenceType,
        );
        return apiSuccess(correspondence);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "correspondences.update");
        const body = updateCorrespondenceSchema.parse(await req.json());
        const correspondence = await updateCorrespondence(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(correspondence, "Cập nhật văn bản thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
