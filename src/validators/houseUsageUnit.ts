import { z } from "zod";
import { HOUSE_USAGE_TYPE } from "@/types";

export const createHouseUsageUnitSchema = z
    .object({
        houseId: z.string().min(1, "Thiếu nhà số"),
        unitLabel: z.string().min(1, "Tên đơn vị không được để trống"),
        usageType: z.enum(HOUSE_USAGE_TYPE),
        householdId: z.string().optional(),
        businessId: z.string().optional(),
        companyId: z.string().optional(),
        note: z.string().optional(),
    })
    .refine(
        data => {
            const refs = [data.householdId, data.businessId, data.companyId].filter(
                Boolean,
            );
            if (refs.length !== 1) return false;
            if (data.usageType === "household") return !!data.householdId;
            if (data.usageType === "business") return !!data.businessId;
            return !!data.companyId;
        },
        {
            message:
                "Phải chọn đúng một đối tượng (hộ dân/hộ kinh doanh/công ty) khớp với loại đơn vị",
        },
    );
export type CreateHouseUsageUnitInput = z.infer<
    typeof createHouseUsageUnitSchema
>;

export const updateHouseUsageUnitSchema = z.object({
    unitLabel: z.string().min(1).optional(),
    note: z.string().optional(),
});
export type UpdateHouseUsageUnitInput = z.infer<
    typeof updateHouseUsageUnitSchema
>;
