import { z } from "zod";
import { DANG_KY_HOP } from "@/types";

export const createMeetingSchema = z.object({
    title: z.string().min(3, "Tiêu đề quá ngắn"),
    startTime: z.string().datetime("Thời gian không hợp lệ"),
    location: z.string().min(1, "Vui lòng nhập địa điểm"),
    content: z.string().min(1, "Vui lòng nhập nội dung"),
    minutes: z.string().optional(),
    published: z.boolean().default(false),
    eligibleRoles: z.array(z.string()).optional(),
    eligibleStreetIds: z.array(z.string()).optional(),
    eligibleNeighborhoodIds: z.array(z.string()).optional(),
    eligibleBusinessTypeIds: z.array(z.string()).optional(),
    eligibleAll: z.boolean().default(true),
});
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export const updateMeetingSchema = createMeetingSchema.partial();
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export const registerMeetingSchema = z
    .object({
        answer: z.enum(DANG_KY_HOP),
        delegateName: z.string().optional(),
    })
    .refine(data => data.answer !== "uy_quyen" || !!data.delegateName?.trim(), {
        message: "Vui lòng nhập tên người được ủy quyền",
        path: ["delegateName"],
    });
export type RegisterMeetingInput = z.infer<typeof registerMeetingSchema>;
