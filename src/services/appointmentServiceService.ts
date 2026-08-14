import {
    Appointment,
    AppointmentService,
    Neighborhood,
    User,
    type IAppointmentService,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateAppointmentServiceInput,
    UpdateAppointmentServiceInput,
} from "@/validators/appointmentService";

async function assertOfficerUserIdsValid(userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    const unique = [...new Set(userIds)];
    const count = await User.countDocuments({
        _id: { $in: unique },
        status: "active",
    });
    if (count !== unique.length) {
        throw new HttpError(
            "Danh sach can bo phu trach co tai khoan khong hop le/da bi khoa",
            422,
        );
    }
}

/**
 * Tra ve Neighborhood tuong ung (nem 404 neu khong ton tai) - dung de resolve
 * wardCode/wardName denormalized khi scope="neighborhood" (cung quy uoc voi
 * houseRecordService.resolveNeighborhoodForHouse: to dan pho la nguon "su
 * that" cho phuong/xa, khong dung gia tri client tu gui kem).
 */
async function resolveNeighborhoodWard(neighborhoodId: string) {
    const neighborhood = await Neighborhood.findById(neighborhoodId).select(
        "wardCode wardName",
    );
    if (!neighborhood) throw new HttpError("Khong tim thay to dan pho", 404);
    return neighborhood;
}

export async function listAppointmentServices(params: { activeOnly?: boolean }) {
    const filter: Record<string, unknown> = {};
    if (params.activeOnly) filter.active = true;
    return AppointmentService.find(filter)
        .sort({ name: 1 })
        .populate("assignedOfficerUserIds", "displayName");
}

export async function getAppointmentServiceById(id: string) {
    const service = await AppointmentService.findById(id).populate(
        "assignedOfficerUserIds",
        "displayName",
    );
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    return service;
}

export async function createAppointmentService(
    actorUser: IUser,
    input: CreateAppointmentServiceInput,
): Promise<IAppointmentService> {
    const key = input.key.trim().toLowerCase();
    if (await AppointmentService.exists({ key })) {
        throw new HttpError("Ma dich vu da ton tai", 409);
    }
    await assertOfficerUserIdsValid(input.assignedOfficerUserIds);

    let wardCode: number | undefined;
    let wardName: string | undefined;
    let neighborhoodId: string | undefined;
    if (input.scope === "neighborhood") {
        neighborhoodId = input.neighborhoodId;
        const neighborhood = await resolveNeighborhoodWard(neighborhoodId!);
        wardCode = neighborhood.wardCode;
        wardName = neighborhood.wardName;
    } else {
        // scope="ward": mac dinh lay theo pham vi phuong/xa cua nguoi tao
        // (cung quy uoc voi ComplaintTypeDefinition/RequestTypeDefinition) -
        // input.wardCode chi la phuong an du phong cho admin (khong co
        // wardCode rieng vi quan tri toan he thong).
        wardCode = actorUser.wardCode ?? input.wardCode;
        wardName = actorUser.wardCode ? actorUser.wardName : undefined;
    }

    const service = await AppointmentService.create({
        key,
        name: input.name,
        description: input.description,
        locationAddress: input.locationAddress,
        scope: input.scope,
        wardCode,
        wardName,
        neighborhoodId,
        slotDurationMinutes: input.slotDurationMinutes,
        autoApprove: input.autoApprove,
        assignedOfficerUserIds: input.assignedOfficerUserIds,
        timeSlots: input.timeSlots,
        active: input.active,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment_service.create",
        targetModel: "AppointmentService",
        targetId: service._id,
        metadata: { key },
    });

    return service.populate("assignedOfficerUserIds", "displayName");
}

export async function updateAppointmentService(
    actorUser: IUser,
    id: string,
    input: UpdateAppointmentServiceInput,
): Promise<IAppointmentService> {
    const service = await AppointmentService.findById(id);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);

    if (input.assignedOfficerUserIds) {
        await assertOfficerUserIdsValid(input.assignedOfficerUserIds);
    }

    // wardCode/wardName khong nam trong input tu client (chi duoc suy ra o
    // day, cung quy uoc voi createAppointmentService) - tinh rieng thanh bien
    // dia phuong roi gan truc tiep vao service, khong dua vao vong lap patch
    // chung ben duoi (input type khong co truong wardName).
    let resolvedWardCode: number | undefined;
    let resolvedWardName: string | undefined;
    let resolvedNeighborhoodId: string | undefined;
    const nextScope = input.scope ?? service.scope;
    if (nextScope === "neighborhood") {
        const neighborhoodId =
            input.neighborhoodId ?? String(service.neighborhoodId || "");
        if (!neighborhoodId) {
            throw new HttpError("Thieu to dan pho khi pham vi la to dan pho", 422);
        }
        const neighborhood = await resolveNeighborhoodWard(neighborhoodId);
        resolvedNeighborhoodId = neighborhoodId;
        resolvedWardCode = neighborhood.wardCode;
        resolvedWardName = neighborhood.wardName;
    } else if (input.scope === "ward") {
        // Chuyen tu "neighborhood" sang "ward" - bo neighborhoodId cu, quay ve
        // wardCode/wardName cua nguoi thao tac (giong luc tao moi).
        resolvedWardCode = actorUser.wardCode ?? input.wardCode;
        resolvedWardName = actorUser.wardCode ? actorUser.wardName : undefined;
    }

    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && key !== "neighborhoodId" && key !== "wardCode") {
            (service as unknown as Record<string, unknown>)[key] = value;
        }
    }
    if (nextScope === "neighborhood") {
        service.neighborhoodId = resolvedNeighborhoodId as any;
    } else if (input.scope === "ward") {
        // $unset qua gan truc tiep khong xoa duoc field neu value=undefined bi
        // vong for tren bo qua - dat rieng de dam bao neighborhoodId cu duoc don.
        service.neighborhoodId = undefined;
    }
    if (resolvedWardCode !== undefined) service.wardCode = resolvedWardCode;
    if (resolvedWardName !== undefined) service.wardName = resolvedWardName;
    service.updatedBy = actorUser._id as any;
    await service.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment_service.update",
        targetModel: "AppointmentService",
        targetId: service._id,
        metadata: { key: service.key, active: service.active },
    });

    return service.populate("assignedOfficerUserIds", "displayName");
}

export async function archiveAppointmentService(
    actorUser: IUser,
    id: string,
): Promise<null> {
    const service = await AppointmentService.findById(id);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);

    service.active = false;
    service.updatedBy = actorUser._id as any;
    await service.save();

    const usageCount = await Appointment.countDocuments({ serviceId: service._id });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment_service.archive",
        targetModel: "AppointmentService",
        targetId: service._id,
        metadata: { key: service.key, usageCount },
    });

    return null;
}
