import { Setting } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import type { UpsertSettingInput } from "@/validators/setting";

const APP_LOGO_SETTING_KEY = "app_logo_url";

// Danh sach key duoc phep hien thi cong khai cho nguoi dan (khong can dang nhap).
// Tuyet doi khong tra ve toan bo Setting cho client khong xac thuc vi co the
// chua cau hinh noi bo (vd template import/export, tham so he thong...).
const PUBLIC_SETTING_KEYS = [
    "app_identity",
    "emergency_contacts",
    "oa_info",
    "committee_members",
    "community_stats",
    // Thu tu/hien thi tinh nang tren trang chu Mini App (xem
    // constants/utinities.ts:resolveFeatureOrder o Mini App) - admin cau hinh
    // qua man /mini-app-features, khong nhay cam nen an toan de cong khai.
    "mini_app_features",
    // URL logo thay the chu "Quan ly To dan pho" tren header web admin/trang
    // dang nhap - xem uploadAppLogo/removeAppLogo. An toan cong khai vi chi la
    // duong dan anh, khong phai du lieu noi bo.
    APP_LOGO_SETTING_KEY,
    // Mo ta tuy chinh cho tung muc menu sidebar (de admin sua qua UI thay vi
    // sua code) - xem constants/modules.ts (mac dinh) va man Cai dat o admin
    // web app. Chi la chuoi mo ta hien thi, khong nhay cam nen an toan cong
    // khai cho moi vai tro dang nhap.
    "section_descriptions",
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

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".svg", ".webp"];

export async function uploadAppLogo(actorId: string, file: File) {
    if (file.size > MAX_LOGO_SIZE_BYTES) {
        throw new HttpError(
            "File vượt quá dung lượng cho phép (tối đa 2MB)",
            400,
        );
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_LOGO_EXTENSIONS.includes(ext)) {
        throw new HttpError(
            `Định dạng ảnh không được hỗ trợ (chỉ chấp nhận ${ALLOWED_LOGO_EXTENSIONS.join(", ")})`,
            400,
        );
    }

    const previousUrl = (await getSetting(APP_LOGO_SETTING_KEY)) as
        | string
        | null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(buffer, file.name, "settings");

    const setting = await upsertSetting(actorId, {
        key: APP_LOGO_SETTING_KEY,
        value: url,
    });

    if (previousUrl) await deleteUploadedFile(previousUrl);

    return setting;
}

export async function removeAppLogo(actorId: string) {
    const previousUrl = (await getSetting(APP_LOGO_SETTING_KEY)) as
        | string
        | null;
    if (previousUrl) await deleteUploadedFile(previousUrl);

    const setting = await upsertSetting(actorId, {
        key: APP_LOGO_SETTING_KEY,
        value: null,
    });
    return setting;
}
