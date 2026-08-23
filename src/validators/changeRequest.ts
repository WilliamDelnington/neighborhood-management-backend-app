import { z } from "zod";
import { CHANGE_REQUEST_TARGET_MODELS } from "@/models";

export const createChangeRequestSchema = z
    .object({
        targetModel: z.enum(CHANGE_REQUEST_TARGET_MODELS),
        targetId: z.string().min(1),
        changeType: z.enum([
            "update",
            "unlink",
            "transfer_neighborhood",
            "data_discrepancy",
        ]),
        patch: z.record(z.string(), z.unknown()).optional(),
        reason: z.string().optional(),
    })
    .refine(
        data =>
            (data.changeType !== "update" &&
                data.changeType !== "data_discrepancy") ||
            (data.patch && Object.keys(data.patch).length > 0),
        {
            message: "Vui lòng nhập ít nhất một trường cần thay đổi",
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
            message: "Vui lòng chọn tổ dân phố muốn chuyển đến",
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
        message: "Vui lòng nhập lý do khi từ chối yêu cầu",
        path: ["decisionNote"],
    });
export type DecideChangeRequestInput = z.infer<typeof decideChangeRequestSchema>;
