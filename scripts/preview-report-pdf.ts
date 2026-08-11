import fs from "fs/promises";
import path from "path";
import { createAnalyticsPdfBuffer } from "@/lib/pdfExport";

async function main() {
    const outputDir = path.resolve("tmp/pdfs");
    await fs.mkdir(outputDir, { recursive: true });
    const buffer = await createAnalyticsPdfBuffer(
        "Báo cáo KPI Phường",
        {
            totalNeighborhoods: 12,
            taskKpis: [
                { label: "Nhiệm vụ hoàn thành", value: 92.5, target: ">= 90%", targetMet: true },
                { label: "Nhiệm vụ đúng hạn", value: 86.2, target: ">= 85%", targetMet: true },
            ],
            feedback: {
                received: 48,
                verified: 37,
                forwarded: 6,
                pending: 5,
            },
            inspections: [
                { label: "Đã xác minh", count: 155 },
                { label: "Cần bổ sung", count: 12 },
                { label: "Cần kiểm tra thực địa", count: 4 },
            ],
        },
        {
            fromDate: new Date("2026-08-01T00:00:00+07:00"),
            toDate: new Date("2026-08-31T23:59:59+07:00"),
        },
    );
    const output = path.join(outputDir, "report-preview.pdf");
    await fs.writeFile(output, buffer);
    console.log(output);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
