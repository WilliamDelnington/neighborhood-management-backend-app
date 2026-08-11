import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException } from "@/lib/response";
import { createPeriodicReportPdfBuffer, pdfDownloadResponse } from "@/lib/pdfExport";
import { writeAuditLog } from "@/services/auditService";
import { getPeriodicReportVersionForExport } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.export");
        const versionRaw = new URL(req.url).searchParams.get("version");
        const version = versionRaw ? Number(versionRaw) : undefined;
        const snapshot = await getPeriodicReportVersionForExport(
            actorUser,
            params.id,
            version,
        );
        const buffer = await createPeriodicReportPdfBuffer(snapshot.toObject());
        await writeAuditLog({
            actorId: actorUser._id,
            action: "DATA_EXPORTED",
            targetModel: "PeriodicReport",
            targetId: params.id,
            metadata: { format: "pdf", version: snapshot.version },
        });
        return pdfDownloadResponse(
            buffer,
            `bao-cao-to-dan-pho-v${snapshot.version}.pdf`,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
