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
