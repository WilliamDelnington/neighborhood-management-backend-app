import type { Model } from "mongoose";
import {
    HouseUsageUnit,
    HouseRecord,
    Household,
    Business,
    Company,
    type IHouseUsageUnit,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateHouseUsageUnitInput,
    UpdateHouseUsageUnitInput,
} from "@/validators/houseUsageUnit";

const OCCUPANT_MODELS = {
    household: Household,
    business: Business,
    company: Company,
} as const;

const OCCUPANT_FIELD = {
    household: "householdId",
    business: "businessId",
    company: "companyId",
} as const;

/**
 * Nem HttpError neu doi tuong duoc chon (Household/Business/Company) khong
 * ton tai, khong thuoc ve dung nha so nay, hoac da duoc gan vao mot don vi su
 * dung khac - HouseUsageUnit la lop bo sung, chi duoc gom lai cac doi tuong da
 * co san duoi houseId cua nha (khong tu tao moi Household/Business/Company).
 */
async function assertOccupantAvailableForHouse(
    usageType: CreateHouseUsageUnitInput["usageType"],
    occupantId: string,
    houseId: string,
): Promise<void> {
    // Ep ve mongoose.Model<any> - OCCUPANT_MODELS gom 3 model khac nhau
    // (Household/Business/Company), TypeScript khong the goi mot phuong thuc
    // tren union cua 3 kieu ham co overload khac nhau. Chi dung findById va
    // doc houseId (co ca 3 model) nen an toan ve runtime.
    const model = OCCUPANT_MODELS[usageType] as Model<any>;
    const occupant = await model.findById(occupantId);
    if (!occupant) {
        throw new HttpError(
            "Khong tim thay doi tuong duoc chon cho don vi su dung",
            404,
        );
    }
    if (String(occupant.houseId) !== String(houseId)) {
        throw new HttpError("Doi tuong duoc chon khong thuoc ve nha so nay", 400);
    }

    const alreadyLinked = await HouseUsageUnit.exists({
        [OCCUPANT_FIELD[usageType]]: occupantId,
    });
    if (alreadyLinked) {
        throw new HttpError(
            "Doi tuong nay da duoc gan vao mot don vi su dung khac",
            409,
        );
    }
}

function resolveOccupantId(input: CreateHouseUsageUnitInput): string | undefined {
    if (input.usageType === "household") return input.householdId;
    if (input.usageType === "business") return input.businessId;
    return input.companyId;
}

export async function createHouseUsageUnit(
    actorUser: IUser,
    input: CreateHouseUsageUnitInput,
): Promise<IHouseUsageUnit> {
    const houseRecord = await HouseRecord.findById(input.houseId);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
    await assertHouseRecordInScope(actorUser, houseRecord);

    const occupantId = resolveOccupantId(input);
    if (!occupantId) {
        throw new HttpError("Thieu doi tuong cho don vi su dung", 400);
    }
    await assertOccupantAvailableForHouse(
        input.usageType,
        occupantId,
        input.houseId,
    );

    const unit = await HouseUsageUnit.create({
        houseId: input.houseId,
        unitLabel: input.unitLabel,
        usageType: input.usageType,
        householdId: input.householdId,
        businessId: input.businessId,
        companyId: input.companyId,
        note: input.note,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house_usage_unit.create",
        targetModel: "HouseUsageUnit",
        targetId: unit._id,
        metadata: { houseId: input.houseId, usageType: input.usageType },
    });

    return unit;
}

export async function listHouseUsageUnitsByHouse(
    actorUser: IUser,
    houseId: string,
): Promise<IHouseUsageUnit[]> {
    const houseRecord = await HouseRecord.findById(houseId);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
    await assertHouseRecordInScope(actorUser, houseRecord);

    return HouseUsageUnit.find({ houseId })
        .sort({ createdAt: -1 })
        .populate("householdId", "code headOfHousehold status")
        .populate("businessId", "name status")
        .populate("companyId", "name status");
}

export async function getHouseUsageUnitById(
    id: string,
): Promise<IHouseUsageUnit> {
    const unit = await HouseUsageUnit.findById(id)
        .populate("householdId", "code headOfHousehold status")
        .populate("businessId", "name status")
        .populate("companyId", "name status");
    if (!unit) throw new HttpError("Khong tim thay don vi su dung", 404);
    return unit;
}

/**
 * Chi cho sua unitLabel/note - usageType va doi tuong tham chieu la BAT BIEN
 * sau khi tao (muon doi doi tuong thi xoa don vi va tao lai), giong nguyen tac
 * "houseId khong doi duoc sau khi tao" da ap dung cho Household.
 */
export async function updateHouseUsageUnit(
    actorUser: IUser,
    id: string,
    patch: UpdateHouseUsageUnitInput,
): Promise<IHouseUsageUnit> {
    const unit = await HouseUsageUnit.findById(id);
    if (!unit) throw new HttpError("Khong tim thay don vi su dung", 404);

    const houseRecord = await HouseRecord.findById(unit.houseId);
    if (houseRecord) await assertHouseRecordInScope(actorUser, houseRecord);

    if (patch.unitLabel !== undefined) unit.unitLabel = patch.unitLabel;
    if (patch.note !== undefined) unit.note = patch.note;
    unit.updatedBy = actorUser._id as any;
    await unit.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house_usage_unit.update",
        targetModel: "HouseUsageUnit",
        targetId: unit._id,
        metadata: patch,
    });

    return unit;
}

export async function deleteHouseUsageUnit(
    actorUser: IUser,
    id: string,
): Promise<IHouseUsageUnit> {
    const unit = await HouseUsageUnit.findById(id);
    if (!unit) throw new HttpError("Khong tim thay don vi su dung", 404);

    const houseRecord = await HouseRecord.findById(unit.houseId);
    if (houseRecord) await assertHouseRecordInScope(actorUser, houseRecord);

    await unit.deleteOne();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house_usage_unit.delete",
        targetModel: "HouseUsageUnit",
        targetId: id,
        metadata: { houseId: unit.houseId },
    });

    return unit;
}
