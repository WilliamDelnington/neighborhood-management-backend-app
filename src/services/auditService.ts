import { AuditLog } from "@/models";
import type { Types } from "mongoose";

export type WriteAuditLogParams = {
    actorId?: string | Types.ObjectId;
    action: string;
    targetModel?: string;
    targetId?: string | Types.ObjectId;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
};

export type ListAuditLogsParams = {
    action?: string;
    targetModel?: string;
    targetId?: string;
    actorId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
};

export async function listAuditLogs(params: ListAuditLogsParams = {}) {
    const filter: Record<string, unknown> = {};
    if (params.action) filter.action = { $regex: params.action, $options: "i" };
    if (params.targetModel) filter.targetModel = params.targetModel;
    if (params.targetId) filter.targetId = params.targetId;
    if (params.actorId) filter.actorId = params.actorId;
    if (params.from || params.to) {
        filter.createdAt = {
            ...(params.from ? { $gte: params.from } : {}),
            ...(params.to ? { $lte: params.to } : {}),
        };
    }
    const page = params.page || 1;
    const limit = params.limit || 20;

    const [items, total] = await Promise.all([
        AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("actorId", "displayName phone email"),
        AuditLog.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

/**
 * Ghi log cho cac thao tac nhay cam: doi role, doi tai chinh, doi trang thai phan anh,
 * import, export, xoa du lieu. Khong duoc throw loi lam gian doan request chinh.
 */
export async function writeAuditLog(
    params: WriteAuditLogParams,
): Promise<void> {
    try {
        await AuditLog.create(params);
    } catch (err) {
        console.error("Ghi audit log that bai:", err);
    }
}
