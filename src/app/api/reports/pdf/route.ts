import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, HttpError } from "@/lib/response";
import { createAnalyticsPdfBuffer, pdfDownloadResponse } from "@/lib/pdfExport";
import { writeAuditLog } from "@/services/auditService";
import {
    getBusinessReport,
    getComplaintReport,
    getFinanceReport,
    getHouseholdReport,
    getHouseReport,
    getPcccReport,
    getPopulationReport,
    getRequestReport,
    getSecurityReport,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

const REPORTS = {
    population: { title: "Báo cáo dân cư", file: "bao-cao-dan-cu.pdf" },
    households: { title: "Báo cáo hộ dân", file: "bao-cao-ho-dan.pdf" },
    complaints: { title: "Báo cáo phản ánh", file: "bao-cao-phan-anh.pdf" },
    requests: { title: "Báo cáo yêu cầu công việc", file: "bao-cao-yeu-cau.pdf" },
    houses: { title: "Báo cáo Nhà số", file: "bao-cao-nha-so.pdf" },
    business: { title: "Báo cáo hộ kinh doanh", file: "bao-cao-ho-kinh-doanh.pdf" },
    pccc: { title: "Báo cáo PCCC", file: "bao-cao-pccc.pdf" },
    security: { title: "Báo cáo an ninh", file: "bao-cao-an-ninh.pdf" },
    finance: { title: "Báo cáo tài chính", file: "bao-cao-tai-chinh.pdf" },
} as const;

type ReportKey = keyof typeof REPORTS;

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.export");
        const { searchParams } = new URL(req.url);
        const report = searchParams.get("report") as ReportKey | null;
        if (!report || !(report in REPORTS)) {
            throw new HttpError("Loai bao cao PDF khong hop le", 422);
        }
        if (report === "finance") {
            await requirePermission(actorUser, "finance.read");
        } else {
            await requirePermission(actorUser, "reports.read");
        }
        const fromDateRaw = searchParams.get("fromDate");
        const toDateRaw = searchParams.get("toDate");
        const range = {
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
        };
        let data: unknown;
        if (report === "population") data = await getPopulationReport(actorUser, range);
        else if (report === "households") data = await getHouseholdReport(actorUser, range);
        else if (report === "complaints") data = await getComplaintReport(actorUser, range);
        else if (report === "requests") data = await getRequestReport(actorUser, range);
        else if (report === "houses") data = await getHouseReport(actorUser, range);
        else if (report === "business") data = await getBusinessReport(actorUser, range);
        else if (report === "pccc") data = await getPcccReport(actorUser, range);
        else if (report === "security") data = await getSecurityReport(actorUser, range);
        else data = await getFinanceReport(range);

        const descriptor = REPORTS[report];
        const buffer = await createAnalyticsPdfBuffer(
            descriptor.title,
            data as Record<string, unknown>,
            range,
        );
        await writeAuditLog({
            actorId: actorUser._id,
            action: "DATA_EXPORTED",
            targetModel: "Report",
            metadata: {
                report,
                format: "pdf",
                fromDate: fromDateRaw,
                toDate: toDateRaw,
            },
        });
        return pdfDownloadResponse(buffer, descriptor.file);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
