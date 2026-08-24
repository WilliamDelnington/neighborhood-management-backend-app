import { z } from "zod";

// Category cua FileAsset. Khong dua vao src/types/index.ts vi day la enum noi bo
// cua module Files/Forms, khong phai enum nghiep vu dung chia se nhieu noi.
export const FILE_ASSET_CATEGORIES = [
    "form",
    "attachment",
    "minutes",
    "other",
] as const;

export const createFileAssetSchema = z.object({
    name: z.string().min(1, "Tên file là bắt buộc"),
    // Giai doan dau chi ho tro file dang lien ket (vd Google Drive, link storage co san).
    // TODO: khi co storage adapter cho upload nhi phan, cho phep tao FileAsset tu ket qua upload.
    url: z.string().url("Đường dẫn file không hợp lệ"),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().nonnegative().optional(),
    category: z.enum(FILE_ASSET_CATEGORIES).default("other"),
    isPublic: z.boolean().default(false),
    // audienceAll=true: bo qua targetRoles, ai cung xem duoc (mac dinh, giu hanh vi cu).
    // audienceAll=false: chi user co role nam trong targetRoles moi xem duoc.
    targetRoles: z.array(z.string()).default([]),
    audienceAll: z.boolean().default(true),
    relatedModel: z.string().optional(),
    relatedId: z.string().optional(),
});
export type CreateFileAssetInput = z.infer<typeof createFileAssetSchema>;

export const updateFileAssetSchema = createFileAssetSchema.partial();
export type UpdateFileAssetInput = z.infer<typeof updateFileAssetSchema>;

// Danh cho nhanh POST /api/files dang multipart/form-data (tai file nhi phan
// truc tiep). url/mimeType/sizeBytes duoc suy ra tu file da luu (xem
// fileAssetService.createFileAssetFromUpload) nen khong xuat hien o day; cac
// truong con lai den tu formData nen deu la string/boolean da duoc route parse
// truoc khi goi schema nay.
export const createFileAssetUploadMetaSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    category: z.enum(FILE_ASSET_CATEGORIES).default("other"),
    isPublic: z.boolean().default(false),
    targetRoles: z.array(z.string()).default([]),
    audienceAll: z.boolean().default(true),
    relatedModel: z.string().optional(),
    relatedId: z.string().optional(),
});
export type CreateFileAssetUploadMetaInput = z.infer<
    typeof createFileAssetUploadMetaSchema
>;
