import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { sanitizeUserWithPermissions, updateOwnProfile } from "@/services/authService";
import { updateProfileSchema } from "@/validators/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        return apiSuccess(await sanitizeUserWithPermissions(user));
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        const body = updateProfileSchema.parse(await req.json());
        const updated = await updateOwnProfile(String(user._id), body);
        return apiSuccess(updated, "Cap nhat tai khoan thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
