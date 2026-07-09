import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { getSessionFromRequest } from "@/lib/auth";
import { requireSession, requireRole } from "@/lib/rbac";
import { upsertSettingSchema } from "@/validators/setting";
import {
    listSettings,
    upsertSetting,
    getPublicSettings,
} from "@/services/settingsService";

export const dynamic = "force-dynamic";

// GET la endpoint "dual mode" giong announcements/files: co session admin hop le
// kem ?admin=1 thi tra ve toan bo cau hinh he thong; con lai chi tra ve nhom key
// da duoc whitelist an toan cho nguoi dan (getPublicSettings).
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const session = getSessionFromRequest(req);
        const isAdminSession = !!session && session.roles.includes("admin");
        const wantsAdminView = searchParams.get("admin") === "1";

        if (isAdminSession && wantsAdminView) {
            const settings = await listSettings();
            return apiSuccess(settings);
        }

        const settings = await getPublicSettings();
        return apiSuccess(settings);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

async function handleUpsert(req: Request) {
    await connectDB();
    const session = requireSession(req);
    requireRole(session, "admin");
    const body = upsertSettingSchema.parse(await req.json());
    const setting = await upsertSetting(session.userId, body);
    return apiSuccess(setting, "Cap nhat cau hinh thanh cong");
}

export async function POST(req: Request) {
    try {
        return await handleUpsert(req);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PUT(req: Request) {
    try {
        return await handleUpsert(req);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
