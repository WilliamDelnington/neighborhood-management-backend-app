/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Dien/dong bo lai provinceCode/provinceName/wardCode/wardName cua HouseRecord
 * tu chinh Neighborhood (to dan pho) ma nha so do dang gan - dung logic nguon
 * "su that" giong houseRecordService.resolveAdministrativeDivisions (to dan
 * pho, neu co, LUON ghi de gia tri tren House).
 *
 * Ly do can script nay: House chi duoc dong bo lai truong nay MOI LUC
 * create/update qua API (xem resolveAdministrativeDivisions) - nha so cu
 * khong duoc dong ai sua lai se giu nguyen gia tri cu (thieu, hoac gan voi ma
 * tinh/phuong TRUOC sap nhap 2025). Tuong tu, nhieu to dan pho duoc tao truoc
 * khi co truong provinceCode/wardCode (xem models/Neighborhood.ts) nen ban
 * than to dan pho cung dang thieu - nhung nha so thuoc cac to dan pho DO se bi
 * BO QUA o day (khong co nguon de suy ra), phai doi admin bo sung
 * Tinh/Thanh pho + Phuong/Xa cho to dan pho do truoc (qua man Chi tiet to dan
 * pho) roi chay lai script nay - an toan de chay lai nhieu lan (idempotent).
 *
 * Nha so KHONG gan to dan pho (neighborhoodId trong) cung bi BO QUA - khong co
 * nguon nao khac de suy ra tinh/phuong cho truong hop nay (giong cach
 * resolveAdministrativeDivisions chi giu nguyen input client neu khong co to
 * dan pho, khong ap dung cho backfill hang loat).
 *
 * Cac module cua app phai duoc import DONG (dynamic import) sau khi loadEnv()
 * chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 *
 * KHONG chan database production (khac create-user.ts/seed.ts) - day la script
 * sua du lieu that (giong cac backfill-*.ts khac trong thu muc nay), can chay
 * duoc tren CA dev lan production, moi ben voi MONGODB_URI (.env.local) rieng
 * cua no - hai database hoan toan doc lap (xem DEV_DEPLOY.md).
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { HouseRecord, Neighborhood } = await import("../src/models");

    if (!process.env.MONGODB_URI) {
        throw new Error("Missing MONGODB_URI (check .env.local)");
    }
    await connectDB();

    const neighborhoods = await Neighborhood.find({
        provinceCode: { $type: "number" },
        wardCode: { $type: "number" },
    }).select("_id provinceCode provinceName wardCode wardName");
    console.log(
        `To dan pho da co Tinh/Thanh pho + Phuong/Xa: ${neighborhoods.length}`,
    );
    const byNeighborhoodId = new Map(
        neighborhoods.map(n => [String(n._id), n]),
    );

    const houses = await HouseRecord.find({
        neighborhoodId: { $ne: null },
    }).select("_id neighborhoodId provinceCode wardCode");
    console.log(`Nha so co gan to dan pho can kiem tra: ${houses.length}`);

    let updated = 0;
    let skippedNoNeighborhoodData = 0;
    for (const house of houses) {
        const neighborhood = byNeighborhoodId.get(String(house.neighborhoodId));
        if (!neighborhood) {
            skippedNoNeighborhoodData += 1;
            continue;
        }
        const alreadyInSync =
            house.provinceCode === neighborhood.provinceCode &&
            house.wardCode === neighborhood.wardCode;
        if (alreadyInSync) continue;

        // eslint-disable-next-line no-await-in-loop
        await HouseRecord.updateOne(
            { _id: house._id },
            {
                $set: {
                    provinceCode: neighborhood.provinceCode,
                    provinceName: neighborhood.provinceName,
                    wardCode: neighborhood.wardCode,
                    wardName: neighborhood.wardName,
                },
            },
        );
        updated += 1;
    }

    console.log(
        `\nHoan tat. Da dong bo Tinh/Thanh pho + Phuong/Xa cho ${updated}/${houses.length} nha so.`,
    );
    if (skippedNoNeighborhoodData > 0) {
        console.log(
            `Bo qua ${skippedNoNeighborhoodData} nha so vi to dan pho cua chung ` +
                "CHUA co Tinh/Thanh pho + Phuong/Xa - vao Chi tiet to dan pho de bo " +
                "sung roi chay lai script nay.",
        );
    }
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
