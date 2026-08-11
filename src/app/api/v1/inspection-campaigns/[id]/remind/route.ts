import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { remindInspectionTargets } from "@/services/inspectionService";
import { remindInspectionSchema } from "@/validators/inspection";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = remindInspectionSchema.parse(await req.json());
        return apiSuccess(
            await remindInspectionTargets(actorUser, params.id, input),
            "Đã gửi nhắc thực hiện",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
