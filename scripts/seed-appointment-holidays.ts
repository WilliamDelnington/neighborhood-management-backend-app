/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Tao (idempotent) cac ngay nghi/le CO DINH theo duong lich (khong doi ngay
 * qua tung nam) ap dung cho TOAN BO cac phuong/xa (wardCode de trong) - Tet
 * Duong lich (1/1), Giai phong mien Nam (30/4), Quoc te Lao dong (1/5), Quoc
 * khanh (2/9).
 *
 * KHONG seed Tet Nguyen Dan/Gio To Hung Vuong hay bat ky ngay le am lich nao
 * o day - lich nghi Tet duoc Chinh phu cong bo hang nam nhu MOT KHOANG nhieu
 * ngay (thuong hoan doi ca ngay nghi bu cuoi tuan lien ke), khong the tinh
 * tu dong chi tu ngay am lich - phai duoc admin tung phuong tu khai bao thu
 * cong qua man quan ly ngay nghi (co the dung lich quy doi am->duong lich o
 * form de xac dinh dung ngay mung 1 Tet lam moc tham khao).
 *
 * An toan de chay lai nhieu lan: bo qua ngay da ton tai (khop date+wardCode
 * rong), khong ghi de ten/note admin da tuy chinh.
 *
 * Chay: npm run seed:appointment-holidays -- 2026 2027
 * (khong truyen nam nao thi mac dinh seed nam hien tai va nam ke tiep)
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { AppointmentHoliday } = await import("../src/models");

    await connectDB();

    const argYears = process.argv
        .slice(2)
        .map(arg => Number(arg))
        .filter(n => Number.isInteger(n) && n > 2000);
    const thisYear = new Date().getUTCFullYear();
    const years = argYears.length ? argYears : [thisYear, thisYear + 1];

    const FIXED_HOLIDAYS = [
        { month: 1, day: 1, name: "Tết Dương lịch" },
        { month: 4, day: 30, name: "Ngày Giải phóng miền Nam" },
        { month: 5, day: 1, name: "Ngày Quốc tế Lao động" },
        { month: 9, day: 2, name: "Ngày Quốc khánh" },
    ];

    let created = 0;
    let skipped = 0;

    for (const year of years) {
        for (const holiday of FIXED_HOLIDAYS) {
            const date = new Date(Date.UTC(year, holiday.month - 1, holiday.day));
            // eslint-disable-next-line no-await-in-loop
            const existing = await AppointmentHoliday.findOne({
                date,
                wardCode: { $exists: false },
            }).select("_id");
            if (existing) {
                skipped += 1;
                // eslint-disable-next-line no-continue
                continue;
            }
            // eslint-disable-next-line no-await-in-loop
            await AppointmentHoliday.create({
                date,
                name: `${holiday.name} ${year}`,
                type: "le",
            });
            created += 1;
        }
    }

    console.log(
        `\nHoan tat. Da tao ${created} ngay nghi co dinh, bo qua ${skipped} ngay da ton tai (nam: ${years.join(", ")}).`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
