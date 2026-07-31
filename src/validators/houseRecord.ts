import { z } from "zod";
import { HOUSE_RECORD_STATUS } from "@/types";

const houseRecordBaseSchema = z.object({
    // Cluster van la truong client cu gui len; streetId la lua chon moi (Street
    // picker) - it nhat mot trong hai phai co, resolve/dong bo o service layer
    // (xem src/lib/streetSync.ts).
    cluster: z.string().min(1, "Cum dan cu khong duoc de trong").optional(),
    streetId: z.string().min(1).optional(),
    // To dan pho cua chinh nha so nay - khong suy ra tu Street vi mot duong/pho
    // co the chay qua nhieu to dan pho. Optional/nullable, admin gan thu cong.
    neighborhoodId: z.string().nullable().optional(),
    address: z.string().min(1, "Dia chi khong duoc de trong"),
    note: z.string().optional(),
    residenceDeclarationNumber: z.string().optional(),
});

export const createHouseRecordSchema = houseRecordBaseSchema.refine(
    data => !!data.cluster || !!data.streetId,
    {
        message: "Vui long chon duong/pho hoac nhap cum dan cu",
        path: ["cluster"],
    },
);
export type CreateHouseRecordInput = z.infer<typeof createHouseRecordSchema>;

export const updateHouseRecordSchema = houseRecordBaseSchema.partial();
export type UpdateHouseRecordInput = z.infer<typeof updateHouseRecordSchema>;

export const updateHouseRecordStatusSchema = z.object({
    status: z.enum(HOUSE_RECORD_STATUS),
});
export type UpdateHouseRecordStatusInput = z.infer<
    typeof updateHouseRecordStatusSchema
>;
