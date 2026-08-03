/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Dien neighborhoodId con thieu cho Household/Business (suy tu
 * HouseRecord.neighborhoodId cua houseId lien ket) va Complaint (suy tu
 * ho khau/nhan khau/to dan pho cua nguoi tao, dung lai
 * resolveComplaintNeighborhoodId - xem services/complaintService.ts). CHI
 * dien cac ban ghi dang thieu (neighborhoodId chua co) va CHI khi nguon du
 * lieu da co san - HouseRecord.neighborhoodId duoc admin gan thu cong nen con
 * thieu o nhieu nha, nen script nay an toan de chay lai nhieu lan (idempotent,
 * lan chay thu hai se bao 0 ban ghi duoc cap nhat neu khong co gi thay doi).
 *
 * PcccCheck/SecurityRecord KHONG can backfill: hai model nay khong denormalize
 * cluster/neighborhoodId len chinh no (giong cluster tu truoc gio) - scope
 * duoc tinh truc tiep qua join toi HouseRecord.neighborhoodId luc truy van
 * (xem pcccService.listPcccChecks/securityService.listSecurityRecords). Cung
 * ly do, Announcement khong nam trong script nay - neighborhoodId cua no la
 * pham vi TAC GIA, khong co nguon du lieu lich su dang tin cay de suy nguoc.
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua Citizen model) phai duoc import DONG (dynamic import) sau
 * khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Household, Business, Complaint, HouseRecord, User } = await import(
        "../src/models"
    );
    const { resolveComplaintNeighborhoodId } = await import(
        "../src/services/complaintService"
    );

    await connectDB();

    let householdUpdated = 0;
    const households = await Household.find({
        houseId: { $ne: null },
        neighborhoodId: { $exists: false },
    }).select("_id houseId");
    console.log(`Ho dan can kiem tra: ${households.length}`);
    for (const household of households) {
        // eslint-disable-next-line no-await-in-loop
        const houseRecord = await HouseRecord.findById(household.houseId).select(
            "neighborhoodId",
        );
        if (houseRecord?.neighborhoodId) {
            // eslint-disable-next-line no-await-in-loop
            await Household.updateOne(
                { _id: household._id },
                { $set: { neighborhoodId: houseRecord.neighborhoodId } },
            );
            householdUpdated += 1;
        }
    }

    let businessUpdated = 0;
    const businesses = await Business.find({
        neighborhoodId: { $exists: false },
    }).select("_id houseId");
    console.log(`Ho kinh doanh can kiem tra: ${businesses.length}`);
    for (const business of businesses) {
        // eslint-disable-next-line no-await-in-loop
        const houseRecord = await HouseRecord.findById(business.houseId).select(
            "neighborhoodId",
        );
        if (houseRecord?.neighborhoodId) {
            // eslint-disable-next-line no-await-in-loop
            await Business.updateOne(
                { _id: business._id },
                { $set: { neighborhoodId: houseRecord.neighborhoodId } },
            );
            businessUpdated += 1;
        }
    }

    let complaintUpdated = 0;
    const complaints = await Complaint.find({
        neighborhoodId: { $exists: false },
    }).select("_id createdByUserId");
    console.log(`Phan anh can kiem tra: ${complaints.length}`);
    for (const complaint of complaints) {
        // eslint-disable-next-line no-await-in-loop
        const creator = await User.findById(complaint.createdByUserId);
        if (!creator) continue;
        // eslint-disable-next-line no-await-in-loop
        const neighborhoodId = await resolveComplaintNeighborhoodId(creator);
        if (neighborhoodId) {
            // eslint-disable-next-line no-await-in-loop
            await Complaint.updateOne(
                { _id: complaint._id },
                { $set: { neighborhoodId } },
            );
            complaintUpdated += 1;
        }
    }

    console.log(
        `\nHoan tat. Da dien neighborhoodId cho ${householdUpdated}/${households.length} ho dan, ` +
            `${businessUpdated}/${businesses.length} ho kinh doanh, ` +
            `${complaintUpdated}/${complaints.length} phan anh.`,
    );
    console.log(
        "Luu y: nha so chua duoc admin gan to dan pho (HouseRecord.neighborhoodId " +
            "trong) se KHONG duoc dien o day - chay lai script sau khi admin gan them.",
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
