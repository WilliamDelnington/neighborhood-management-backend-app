import { z } from "zod";
import { LOAI_CAU_HOI_KHAO_SAT } from "@/types";

const surveyQuestionSchema = z.object({
    _id: z.string().optional(),
    question: z.string().min(1, "Vui long nhap noi dung cau hoi"),
    type: z.enum(LOAI_CAU_HOI_KHAO_SAT),
    options: z.array(z.string()).default([]),
    required: z.boolean().default(true),
});

export const createSurveySchema = z.object({
    title: z.string().min(3, "Tieu de qua ngan"),
    description: z.string().optional(),
    questions: z.array(surveyQuestionSchema).min(1, "Can it nhat mot cau hoi"),
    eligibleRoles: z.array(z.string()).optional(),
    eligibleClusters: z.array(z.string()).optional(),
    eligibleStreetIds: z.array(z.string()).optional(),
    eligibleNeighborhoodIds: z.array(z.string()).optional(),
    eligibleBusinessTypeIds: z.array(z.string()).optional(),
    eligibleAll: z.boolean().default(true),
    // Nhan xet/tong hop cua nguoi phu trach khao sat sau khi co ket qua (B08.06)
    // - khong bat buoc luc tao, chi dung khi cap nhat.
    resultSummary: z.string().optional(),
    // Nguoi duoc chu khao sat (nguoi tao) uy quyen cung chinh sua/mo/dong/xoa -
    // xem surveyService.assertSurveyEditable/assertUsersCanCoEdit. Moi id phai
    // la tai khoan dang co quyen "surveys.update".
    coEditorUserIds: z.array(z.string()).optional(),
});
export type CreateSurveyInput = z.infer<typeof createSurveySchema>;

export const updateSurveySchema = createSurveySchema.partial();
export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;

const surveyAnswerSchema = z.object({
    questionId: z.string().min(1),
    selectedOptions: z.array(z.string()).default([]),
    otherText: z.string().optional(),
});

export const respondSurveySchema = z.object({
    answers: z
        .array(surveyAnswerSchema)
        .min(1, "Vui long tra loi it nhat mot cau hoi"),
});
export type RespondSurveyInput = z.infer<typeof respondSurveySchema>;
