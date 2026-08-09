/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * PcccCheck.assigneeId/followUpStatus/deadline va SecurityRecord.assigneeId/
 * monitoringStatus la luong "giao viec" cu, nay thay bang model Request/
 * RequestRecipient chung (xem src/services/requestService.ts). Script nay tao
 * mot Request + mot RequestRecipient cho moi ban ghi PCCC/an ninh da co
 * assigneeId, de lich su giao viec cu van hien thi duoc trong man "Yeu cau
 * cong viec" moi. Cac truong cu tren PcccCheck/SecurityRecord duoc giu nguyen
 * (chi doc, khong con duoc ghi tu cac luong assign da go bo).
 * An toan de chay nhieu lan (idempotent) - bo qua ban ghi da co Request voi
 * cung relatedModel/relatedId.
 *
 * Cac module cua app phai duoc import DONG (dynamic import) sau khi loadEnv()
 * chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 */

const PCCC_STATUS_MAP: Record<string, string> = {
    chua_khac_phuc: "pending",
    dang_khac_phuc: "in_progress",
    da_khac_phuc: "resolved",
};

const SECURITY_STATUS_MAP: Record<string, string> = {
    binh_thuong: "pending",
    dang_theo_doi: "in_progress",
    da_bao_cong_an: "in_progress",
    da_ket_thuc: "resolved",
};

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { PcccCheck, SecurityRecord, Request, RequestRecipient } =
        await import("../src/models");

    await connectDB();

    let created = 0;

    const pcccDocs = await PcccCheck.collection
        .find({ assigneeId: { $exists: true, $ne: null } })
        .toArray();
    console.log(`Tim thay ${pcccDocs.length} ban ghi PCCC da giao viec.`);
    for (const doc of pcccDocs) {
        // eslint-disable-next-line no-await-in-loop
        const already = await Request.exists({
            relatedModel: "PcccCheck",
            relatedId: doc._id,
        });
        if (already) continue;

        // eslint-disable-next-line no-await-in-loop
        const request = await Request.create({
            type: "pccc",
            title: "Theo dõi khắc phục PCCC",
            relatedModel: "PcccCheck",
            relatedId: doc._id,
            houseId: doc.houseId,
            dueDate: doc.deadline,
            createdBy: doc.inspectorId,
            createdAt: doc.updatedAt,
            updatedAt: doc.updatedAt,
        });
        // eslint-disable-next-line no-await-in-loop
        await RequestRecipient.create({
            requestId: request._id,
            userId: doc.assigneeId,
            status: PCCC_STATUS_MAP[String(doc.followUpStatus)] || "pending",
            createdAt: doc.updatedAt,
            updatedAt: doc.updatedAt,
        });
        created += 1;
        console.log(`PcccCheck ${doc._id}: tao Request ${request._id}.`);
    }

    const securityDocs = await SecurityRecord.collection
        .find({ assigneeId: { $exists: true, $ne: null } })
        .toArray();
    console.log(`Tim thay ${securityDocs.length} ho so an ninh da giao viec.`);
    for (const doc of securityDocs) {
        // eslint-disable-next-line no-await-in-loop
        const already = await Request.exists({
            relatedModel: "SecurityRecord",
            relatedId: doc._id,
        });
        if (already) continue;

        // eslint-disable-next-line no-await-in-loop
        const request = await Request.create({
            type: "security",
            title: "Theo dõi hồ sơ an ninh, tạm trú",
            relatedModel: "SecurityRecord",
            relatedId: doc._id,
            houseId: doc.houseId,
            createdBy: doc.createdBy,
            createdAt: doc.updatedAt,
            updatedAt: doc.updatedAt,
        });
        // eslint-disable-next-line no-await-in-loop
        await RequestRecipient.create({
            requestId: request._id,
            userId: doc.assigneeId,
            status:
                SECURITY_STATUS_MAP[String(doc.monitoringStatus)] || "pending",
            createdAt: doc.updatedAt,
            updatedAt: doc.updatedAt,
        });
        created += 1;
        console.log(`SecurityRecord ${doc._id}: tao Request ${request._id}.`);
    }

    console.log(`\nHoan tat. Da tao ${created} Request moi.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
