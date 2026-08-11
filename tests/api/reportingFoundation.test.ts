import { describe, expect, it } from "vitest";
import {
    KpiDefinition,
    Neighborhood,
    PeriodicReportVersion,
    Request,
    RequestRecipient,
    Role,
} from "@/models";
import { GET as requestReportRoute } from "@/app/api/reports/requests/route";
import {
    acceptPeriodicReport,
    createPeriodicReport,
    receivePeriodicReport,
    requestPeriodicReportRevision,
    submitPeriodicReport,
    updatePeriodicReport,
} from "@/services/periodicReportService";
import { evaluateKpis } from "@/services/kpiService";
import { createAnalyticsPdfBuffer } from "@/lib/pdfExport";
import { authHeaders, createTestUser, makeRequest } from "../helpers";

describe("B12/A14/A15 reporting foundation", () => {
    it("validates ward recipient and preserves immutable versions across revision", async () => {
        const neighborhood = await Neighborhood.create({
            name: "Tổ báo cáo",
            code: "REPORT-NB",
            sequence: 991,
            wardCode: 9886,
            wardName: "Phường thử nghiệm",
        });
        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhood._id,
            assignedNeighborhoodIds: [neighborhood._id],
        });
        const receiver = await createTestUser({
            roles: ["people_committee_official"],
            wardCode: 9886,
        });
        const wrongWardReceiver = await createTestUser({
            roles: ["people_committee_official"],
            wardCode: 9999,
        });
        const periodStart = new Date(Date.now() - 86_400_000).toISOString();
        const periodEnd = new Date(Date.now() + 86_400_000).toISOString();

        await expect(
            createPeriodicReport(leader, {
                type: "weekly",
                periodStart,
                periodEnd,
                neighborhoodId: String(neighborhood._id),
                submittedToUserId: String(wrongWardReceiver._id),
                sections: {},
            }),
        ).rejects.toMatchObject({ status: 422 });

        const report = await createPeriodicReport(leader, {
            type: "weekly",
            periodStart,
            periodEnd,
            neighborhoodId: String(neighborhood._id),
            submittedToUserId: String(receiver._id),
            sections: { generalSituation: "Phiên bản một" },
        });
        const firstSubmit = await submitPeriodicReport(leader, String(report._id));
        expect(firstSubmit.status).toBe("submitted");
        expect(firstSubmit.currentVersion).toBe(1);
        await receivePeriodicReport(receiver, String(report._id));
        await requestPeriodicReportRevision(receiver, String(report._id), "Bổ sung kiến nghị");
        await updatePeriodicReport(leader, String(report._id), {
            sections: { recommendations: "Nội dung đã bổ sung" },
        });
        const secondSubmit = await submitPeriodicReport(leader, String(report._id));
        expect(secondSubmit.currentVersion).toBe(2);
        await receivePeriodicReport(receiver, String(report._id));
        const accepted = await acceptPeriodicReport(receiver, String(report._id));
        expect(accepted.status).toBe("accepted");

        const versions = await PeriodicReportVersion.find({ reportId: report._id })
            .sort({ version: 1 });
        expect(versions).toHaveLength(2);
        expect(versions[0].sections.generalSituation).toBe("Phiên bản một");
        expect(versions[0].sections.recommendations).toBeUndefined();
        expect(versions[1].sections.recommendations).toBe("Nội dung đã bổ sung");
    });

    it("evaluates a database-defined task completion KPI", async () => {
        const neighborhood = await Neighborhood.create({
            name: "Tổ KPI",
            code: "KPI-NB",
            sequence: 992,
            wardCode: 9886,
        });
        const wardUser = await createTestUser({
            roles: ["people_committee_official"],
            wardCode: 9886,
        });
        const worker = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhood._id,
            assignedNeighborhoodIds: [neighborhood._id],
        });
        const task = await Request.create({
            type: "task",
            title: "Nhiệm vụ KPI",
            priority: "normal",
            dueDate: new Date(Date.now() + 86_400_000),
            createdBy: wardUser._id,
        });
        await RequestRecipient.create({
            requestId: task._id,
            userId: worker._id,
            status: "resolved",
            resolvedAt: new Date(),
        });
        await KpiDefinition.create({
            code: "task_completion_test",
            name: "Hoàn thành nhiệm vụ",
            formulaType: "ratio",
            dataSource: "task_completion",
            targetValue: 90,
            targetDirection: "gte",
            unit: "%",
            period: "monthly",
            wardCode: 9886,
            active: true,
            createdBy: wardUser._id,
        });
        const result = await evaluateKpis(wardUser, {
            fromDate: new Date(Date.now() - 86_400_000),
            toDate: new Date(Date.now() + 86_400_000),
        });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].value).toBe(100);
        expect(result.items[0].targetMet).toBe(true);
    });

    it("creates a Unicode PDF buffer", async () => {
        const buffer = await createAnalyticsPdfBuffer(
            "Báo cáo KPI Phường",
            { total: 12, groups: [{ label: "Nhiệm vụ hoàn thành", count: 10 }] },
        );
        expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
        expect(buffer.length).toBeGreaterThan(2_000);
    });

    it("requires reports.export in addition to reports.read for Excel", async () => {
        await Role.create({
            key: "report_reader_only",
            name: "Chỉ xem báo cáo",
            permissions: ["reports.read"],
            active: true,
            system: false,
        });
        const reader = await createTestUser({ roles: ["report_reader_only"] });
        const response = await requestReportRoute(
            makeRequest("/api/reports/requests?format=excel", {
                headers: await authHeaders(reader),
            }),
        );
        expect(response.status).toBe(403);
    });
});
