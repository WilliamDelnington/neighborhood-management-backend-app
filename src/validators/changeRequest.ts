import { z } from "zod";
import { CHANGE_REQUEST_TARGET_MODELS } from "@/models";

export const createChangeRequestSchema = z
    .object({
        targetModel: z.enum(CHANGE_REQUEST_TARGET_MODELS),
        targetId: z.string().min(1),
        changeType: z.enum(["update", "unlink"]),
        patch: z.record(z.string(), z.unknown()).optional(),
        reason: z.string().optional(),
    })
    .refine(
        data =>
            data.changeType !== "update" ||
            (data.patch && Object.keys(data.patch).length > 0),
        {
            message: "Vui long nhap it nhat mot truong can thay doi",
            path: ["patch"],
        },
    );
export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;

export const decideChangeRequestSchema = z
    .object({
        approve: z.boolean(),
        decisionNote: z.string().optional(),
    })
    .refine(data => data.approve || !!data.decisionNote?.trim(), {
        message: "Vui long nhap ly do khi tu choi yeu cau",
        path: ["decisionNote"],
    });
export type DecideChangeRequestInput = z.infer<typeof decideChangeRequestSchema>;
