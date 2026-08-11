import { describe, expect, it } from "vitest";
import {
    Household,
    Request,
    RequestRecipient,
} from "@/models";
import {
    buildHouseholdReportWorkbook,
    buildRequestReportWorkbook,
    getHouseholdReport,
    getRequestReport,
} from "@/services/reportService";
import { createTestUser } from "../helpers";

describe("Báo cáo Hộ dân và Yêu cầu công việc", () => {
    it("tổng hợp Hộ dân theo trạng thái, sở hữu, cụm và nhu cầu hỗ trợ", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await Household.create([
            {
                code: "REPORT-HH-1",
                cluster: "Cụm 1",
                address: "1 đường A",
                headOfHousehold: "Nguyễn Văn A",
                memberCount: 4,
                ownershipType: "chinh_chu",
                needsSupport: false,
                status: "verified",
            },
            {
                code: "REPORT-HH-2",
                cluster: "Cụm 2",
                address: "2 đường B",
                headOfHousehold: "Nguyễn Văn B",
                memberCount: 2,
                ownershipType: "cho_thue",
                needsSupport: true,
                status: "pending",
            },
        ]);

        const report = await getHouseholdReport(admin);
        expect(report.total).toBe(2);
        expect(report.totalMembers).toBe(6);
        expect(report.averageMembers).toBe(3);
        expect(report.needsSupportCount).toBe(1);
        expect(report.byCluster).toHaveLength(2);
        expect(buildHouseholdReportWorkbook(report).worksheets.length).toBe(4);
    });

    it("tổng hợp yêu cầu, lượt giao, trạng thái và quá hạn", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const recipient = await createTestUser({ roles: ["people_committee_official"] });
        const [resolvedRequest, overdueRequest] = await Request.create([
            {
                type: "task",
                title: "Công việc đã xong",
                priority: "normal",
                dueDate: new Date(Date.now() + 86_400_000),
                createdBy: admin._id,
            },
            {
                type: "pccc",
                title: "Công việc quá hạn",
                priority: "urgent",
                dueDate: new Date(Date.now() - 86_400_000),
                createdBy: admin._id,
            },
        ]);
        await RequestRecipient.create([
            {
                requestId: resolvedRequest._id,
                userId: recipient._id,
                status: "resolved",
                resolvedAt: new Date(),
            },
            {
                requestId: overdueRequest._id,
                userId: recipient._id,
                status: "in_progress",
            },
        ]);

        const report = await getRequestReport(admin);
        expect(report.totalRequests).toBe(2);
        expect(report.totalRecipientAssignments).toBe(2);
        expect(report.resolvedAssignments).toBe(1);
        expect(report.overdueAssignments).toBe(1);
        expect(report.byType).toHaveLength(2);
        expect(buildRequestReportWorkbook(report).worksheets.length).toBe(4);
    });
});
