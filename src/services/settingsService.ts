import { Setting } from "@/models";
import { writeAuditLog } from "@/services/auditService";
import type { UpsertSettingInput } from "@/validators/setting";

// Danh sach key duoc phep hien thi cong khai cho nguoi dan (khong can dang nhap).
// Tuyet doi khong tra ve toan bo Setting cho client khong xac thuc vi co the
// chua cau hinh noi bo (vd template import/export, tham so he thong...).
const PUBLIC_SETTING_KEYS = [
    "app_identity",
    "emergency_contacts",
    "oa_info",
] as const;

// Luu y: co tinh khong lam endpoint reset/wipe du lieu he thong o day. Day la
// cong cu seed/reset chi danh cho moi truong dev, khong thuoc pham vi API san
// xuat (theo spec).

export async function getSetting(key: string): Promise<unknown | null> {
    const setting = await Setting.findOne({ key });
    return setting ? setting.value : null;
}

export async function listSettings() {
    return Setting.find().sort({ key: 1 }).populate("updatedBy", "displayName");
}

export async function upsertSetting(
    actorId: string,
    input: UpsertSettingInput,
) {
    const setting = await Setting.findOneAndUpdate(
        { key: input.key },
        {
            value: input.value,
            description: input.description,
            updatedBy: actorId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await writeAuditLog({
        actorId,
        action: "setting.upsert",
        targetModel: "Setting",
        targetId: setting!._id,
        metadata: { key: input.key },
    });

    return setting;
}

export async function getPublicSettings(): Promise<Record<string, unknown>> {
    const settings = await Setting.find({ key: { $in: PUBLIC_SETTING_KEYS } });
    const result: Record<string, unknown> = {};
    for (const s of settings) {
        result[s.key] = s.value;
    }
    return result;
}
