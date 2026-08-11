import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { User } from "@/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "wards.manage");
        const users = await User.find({
            roles: { $in: ["secretary", "people_committee_official"] },
            status: "active",
        })
            .select(
                "displayName phone roles status provinceCode provinceName wardCode wardName",
            )
            .sort({ displayName: 1 });
        return apiSuccess(
            users.map(user => ({ ...user.toObject(), id: String(user._id) })),
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
