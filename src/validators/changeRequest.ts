import { z } from "zod";
import { CHANGE_REQUEST_TARGET_MODELS } from "@/models";

export const createChangeRequestSchema = z
    .object({
        targetModel: z.enum(CHANGE_REQUEST_TARGET_MODELS),
        targetId: z.string().min(1),
        changeType: z.enum(["update", "unlink", "transfer_neighborhood"]),
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
    )
    .refine(
        data =>
            data.changeType !== "transfer_neighborhood" ||
            (data.targetModel === "HouseRecord" &&
                typeof data.patch?.neighborhoodId === "string" &&
                data.patch.neighborhoodId.length > 0),
        {
            message: "Vui long chon to dan pho muon chuyen den",
            path: ["patch", "neighborhoodId"],
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
