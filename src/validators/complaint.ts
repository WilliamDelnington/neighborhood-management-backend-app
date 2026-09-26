import { z } from "zod";
import { TRANG_THAI_PHAN_ANH, HOUSE_GIS_SOURCES } from "@/types";

// Permissive - chi kiem tra HINH THUC cua key (cung quy uoc voi
// requestTypeKeySchema trong validators/request.ts). Gia tri THUC te (co
// ton tai mot ComplaintTypeDefinition active tuong ung, hoac thuoc danh sach
// NHOM_PHAN_ANH cu trong giai doan migrate) duoc kiem tra o service layer -
// xem assertValidComplaintCategory trong complaintService.ts.
const complaintCategoryKeySchema = z
    .string()
    .min(1, "Thiếu nhóm phản ánh")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Nhóm phản ánh không hợp lệ");

const createComplaintBaseSchema = z.object({
    category: complaintCategoryKeySchema,
    title: z.string().min(3, "Tiêu đề quá ngắn"),
    content: z.string().min(10, "Nội dung quá ngắn"),
    area: z.string().optional(),
    // Nha so nguoi gui chu dong chon (khong bat buoc, khong can la nha cua
    // chinh ho) - xem createComplaint/resolveComplaintWardCode.
    houseId: z.string().optional(),
    // Id da xin truoc qua POST /api/complaints/draft, dung lam _id cua ban ghi
    // Complaint moi de cac tai lieu da dinh kem tu form tao (xem
    // uploads/token, uploads/attachments) tu dong thuoc ve phan anh nay.
    draftId: z.string().length(24).optional(),
    // Chi co y nghia khi category="ha_tang" - lien ket toi mot tai san cu the
    // trong so ha tang (B11.03), khong bat buoc.
    relatedAssetId: z.string().optional(),
    // Toa do GPS nguoi gui chup luc tao phan anh (tuy chon) - cung quy uoc gis*
    // voi HouseRecord (xem validators/houseRecord.ts). 0/0 duoc coi la chua co
    // toa do o service layer, khong lam sai lech thanh Null Island.
    gisLatitude: z.number().min(-90).max(90).nullable().optional(),
    gisLongitude: z.number().min(-180).max(180).nullable().optional(),
    gisAccuracyMeters: z.number().min(0).nullable().optional(),
    gisSource: z.enum(HOUSE_GIS_SOURCES).optional(),
    gisCapturedAt: z.string().datetime().nullable().optional(),
    // Bat buoc = true khi gisSource la "address_lookup"/"device_gps" (du lieu
    // vi tri nhay cam theo Luat BVDLCN so 91/2025/QH15) - xem
    // requiresComplaintGeoConsent ben duoi, cung quy uoc voi houseRecord.ts.
    geoConsentAccepted: z.boolean().optional(),
});

// Cung logic voi requiresGeoConsent trong validators/houseRecord.ts - lop
// chan phia server cho gisSource nhay cam ("address_lookup"/"device_gps"),
// KHONG chi dua vao checkbox phia client.
function requiresComplaintGeoConsent(data: {
    gisSource?: (typeof HOUSE_GIS_SOURCES)[number];
    geoConsentAccepted?: boolean;
}): boolean {
    return (
        (data.gisSource !== "address_lookup" &&
            data.gisSource !== "device_gps") ||
        data.geoConsentAccepted === true
    );
}
const GEO_CONSENT_ISSUE = {
    message:
        "Cần xác nhận đồng ý thu thập vị trí (dữ liệu nhạy cảm) trước khi gửi tọa độ từ địa chỉ/GPS",
    path: ["geoConsentAccepted"],
};

export const createComplaintSchema = createComplaintBaseSchema.refine(
    requiresComplaintGeoConsent,
    GEO_CONSENT_ISSUE,
);
export type CreateComplaintInput = z.infer<typeof createComplaintBaseSchema>;

export const updateComplaintStatusSchema = z.object({
    status: z.enum(TRANG_THAI_PHAN_ANH),
    note: z.string().optional(),
    isPublic: z.boolean().default(true),
});
export type UpdateComplaintStatusInput = z.infer<
    typeof updateComplaintStatusSchema
>;

export const updateComplaintSchema = z
    .object({
        category: complaintCategoryKeySchema.optional(),
        title: z.string().min(3, "Tiêu đề quá ngắn").optional(),
        content: z.string().min(10, "Nội dung quá ngắn").optional(),
    })
    .refine(
        data =>
            data.category !== undefined ||
            data.title !== undefined ||
            data.content !== undefined,
        { message: "Không có trường nào được thay đổi" },
    );
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;

export const requestReevaluationSchema = z.object({
    note: z.string().min(1, "Vui lòng nhập lý do đề nghị xem xét lại"),
});
export type RequestReevaluationInput = z.infer<
    typeof requestReevaluationSchema
>;

export const assignComplaintSchema = z.object({
    primaryAssigneeId: z.string().min(1),
    secondaryAssigneeIds: z.array(z.string()).default([]),
    expectedCompletionDate: z.string().datetime().optional(),
    transferReason: z.string().min(1).optional(),
});
export type AssignComplaintInput = z.infer<typeof assignComplaintSchema>;

export const escalateComplaintSchema = z.object({
    note: z.string().optional(),
});

export const chooseAssigneeSchema = z.object({
    userId: z.string().min(1, "Thiếu người phụ trách"),
});
export type ChooseAssigneeInput = z.infer<typeof chooseAssigneeSchema>;

export const requestComplaintInfoSchema = z.object({
    content: z.string().min(1, "Vui lòng nhập thông tin cần bổ sung"),
});
export type RequestComplaintInfoInput = z.infer<
    typeof requestComplaintInfoSchema
>;
