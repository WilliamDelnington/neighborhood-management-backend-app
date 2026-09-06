import { Setting } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import type { UpsertSettingInput } from "@/validators/setting";

const APP_LOGO_SETTING_KEY = "app_logo_url";
// Tieu de tab trinh duyet (document.title) va icon tab (favicon) - thay the
// gia tri mac dinh cung trong index.html/favicon.svg neu admin da cau hinh,
// xem DocumentMeta.tsx o admin web app.
const APP_TAB_TITLE_SETTING_KEY = "app_tab_title";
const APP_FAVICON_SETTING_KEY = "app_favicon_url";

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
    // Tieu de tab & favicon - xem ghi chu o tren, cung an toan cong khai vi chi
    // la chuoi hien thi/duong dan anh.
    APP_TAB_TITLE_SETTING_KEY,
    APP_FAVICON_SETTING_KEY,
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

// Tra ve dang key -> value (giong getPublicSettings) de khop voi hinh dang ma
// fetchAllSettings()/SettingsPage.tsx mong doi - KHONG tra ve mang Setting
// document tho (truoc day lam Object.entries() o frontend doc nham theo chi
// so mang thay vi theo key, khien vd logo/tab title khong bao gio hien dung).
export async function listSettings(): Promise<Record<string, unknown>> {
    const settings = await Setting.find().sort({ key: 1 });
    const result: Record<string, unknown> = {};
    for (const s of settings) {
        result[s.key] = s.value;
    }
    return result;
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

const MAX_FAVICON_SIZE_BYTES = 1 * 1024 * 1024;
const ALLOWED_FAVICON_EXTENSIONS = [".ico", ".png", ".svg", ".webp"];

// Logo va favicon deu la "anh thay the mac dinh, luu qua 1 Setting key, xoa
// file cu khi doi/xoa" - gom chung logic o day de them anh cau hinh tuong tu
// sau nay khong phai chep lai tung buoc.
async function uploadImageSetting(
    actorId: string,
    file: File,
    options: {
        settingKey: string;
        maxSizeBytes: number;
        allowedExtensions: string[];
        sizeErrorMessage: string;
    },
) {
    if (file.size > options.maxSizeBytes) {
        throw new HttpError(options.sizeErrorMessage, 400);
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!options.allowedExtensions.includes(ext)) {
        throw new HttpError(
            `Định dạng ảnh không được hỗ trợ (chỉ chấp nhận ${options.allowedExtensions.join(", ")})`,
            400,
        );
    }

    const previousUrl = (await getSetting(options.settingKey)) as
        | string
        | null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(buffer, file.name, "settings");

    const setting = await upsertSetting(actorId, {
        key: options.settingKey,
        value: url,
    });

    if (previousUrl) await deleteUploadedFile(previousUrl);

    return setting;
}

async function removeImageSetting(actorId: string, settingKey: string) {
    const previousUrl = (await getSetting(settingKey)) as string | null;
    if (previousUrl) await deleteUploadedFile(previousUrl);

    return upsertSetting(actorId, { key: settingKey, value: null });
}

export async function uploadAppLogo(actorId: string, file: File) {
    return uploadImageSetting(actorId, file, {
        settingKey: APP_LOGO_SETTING_KEY,
        maxSizeBytes: MAX_LOGO_SIZE_BYTES,
        allowedExtensions: ALLOWED_LOGO_EXTENSIONS,
        sizeErrorMessage: "File vượt quá dung lượng cho phép (tối đa 2MB)",
    });
}

export async function removeAppLogo(actorId: string) {
    return removeImageSetting(actorId, APP_LOGO_SETTING_KEY);
}

export async function uploadAppFavicon(actorId: string, file: File) {
    return uploadImageSetting(actorId, file, {
        settingKey: APP_FAVICON_SETTING_KEY,
        maxSizeBytes: MAX_FAVICON_SIZE_BYTES,
        allowedExtensions: ALLOWED_FAVICON_EXTENSIONS,
        sizeErrorMessage: "File vượt quá dung lượng cho phép (tối đa 1MB)",
    });
}

export async function removeAppFavicon(actorId: string) {
    return removeImageSetting(actorId, APP_FAVICON_SETTING_KEY);
}
