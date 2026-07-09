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
    name: z.string().min(1, "Ten file la bat buoc"),
    // Giai doan dau chi ho tro file dang lien ket (vd Google Drive, link storage co san).
    // TODO: khi co storage adapter cho upload nhi phan, cho phep tao FileAsset tu ket qua upload.
    url: z.string().url("Duong dan file khong hop le"),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().nonnegative().optional(),
    category: z.enum(FILE_ASSET_CATEGORIES).default("other"),
    isPublic: z.boolean().default(false),
    relatedModel: z.string().optional(),
    relatedId: z.string().optional(),
});
export type CreateFileAssetInput = z.infer<typeof createFileAssetSchema>;

export const updateFileAssetSchema = createFileAssetSchema.partial();
export type UpdateFileAssetInput = z.infer<typeof updateFileAssetSchema>;
