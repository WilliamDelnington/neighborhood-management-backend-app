import { describe, expect, it } from "vitest";
import { GET as getDashboardRoute } from "@/app/api/reports/dashboard/route";
import {
    Complaint,
    Household,
    HouseRecord,
    Neighborhood,
    PcccCheck,
} from "@/models";
import { authHeaders, createTestUser, makeRequest, readJson } from "../helpers";

describe("Dashboard theo vai trò và phạm vi", () => {
    it("không trả số liệu nghiệp vụ khi vai trò chỉ có dashboard.read", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        const owner = await createTestUser({ roles: ["house_owner"] });
        await Complaint.create({
            code: "DASH-NO-LEAK",
            category: "pccc",
            title: "Không được lộ trên dashboard",
            content: "Nội dung kiểm thử",
            status: "moi_tiep_nhan",
            createdByUserId: owner._id,
        });

        const response = await getDashboardRoute(
            makeRequest("/api/reports/dashboard", {
                headers: await authHeaders(secretary),
            }),
        );
        const body = await readJson(response);

        expect(response.status).toBe(200);
        expect(body.data.audience).toBe("ward");
        expect(body.data.capabilities.complaints).toBe(false);
        expect(body.data.capabilities.pccc).toBe(false);
        expect(body.data.capabilities.security).toBe(false);
        expect(body.data.newComplaints).toBe(0);
        expect(body.data.charts.complaintStatus).toEqual([]);
    });

    it("chỉ tổng hợp dữ liệu trong Phường được phân công", async () => {
        const [inWardNeighborhood, outOfWardNeighborhood] =
            await Neighborhood.create([
                {
                    name: "Tổ trong Phường",
                    code: "DASH-WARD-IN",
                    sequence: 97001,
                    wardCode: 9700,
                    wardName: "Phường thử nghiệm",
                },
                {
                    name: "Tổ ngoài Phường",
                    code: "DASH-WARD-OUT",
                    sequence: 98001,
                    wardCode: 9800,
                    wardName: "Phường khác",
                },
            ]);
        const [inWardHouse, outOfWardHouse] = await HouseRecord.create([
            {
                code: "DASH-HOUSE-IN",
                cluster: "Cụm trong",
                neighborhoodId: inWardNeighborhood._id,
                wardCode: 9700,
                address: "1 đường A",
            },
            {
                code: "DASH-HOUSE-OUT",
                cluster: "Cụm ngoài",
                neighborhoodId: outOfWardNeighborhood._id,
                wardCode: 9800,
                address: "2 đường B",
            },
        ]);
        await Household.create([
            {
                code: "DASH-HH-IN",
                cluster: "Cụm trong",
                neighborhoodId: inWardNeighborhood._id,
                houseId: inWardHouse._id,
                address: "1 đường A",
                headOfHousehold: "Hộ trong Phường",
            },
            {
                code: "DASH-HH-OUT",
                cluster: "Cụm ngoài",
                neighborhoodId: outOfWardNeighborhood._id,
                houseId: outOfWardHouse._id,
                address: "2 đường B",
                headOfHousehold: "Hộ ngoài Phường",
            },
        ]);
        const official = await createTestUser({
            roles: ["people_committee_official"],
            wardCode: 9700,
            wardName: "Phường thử nghiệm",
        });
        const owner = await createTestUser({ roles: ["house_owner"] });
        await Complaint.create([
            {
                code: "DASH-COMPLAINT-IN",
                category: "gop_y_chung",
                title: "Phản ánh trong Phường",
                content: "Nội dung",
                status: "moi_tiep_nhan",
                wardCode: 9700,
                neighborhoodId: inWardNeighborhood._id,
                createdByUserId: owner._id,
            },
            {
                code: "DASH-COMPLAINT-OUT",
                category: "gop_y_chung",
                title: "Phản ánh ngoài Phường",
                content: "Nội dung",
                status: "moi_tiep_nhan",
                wardCode: 9800,
                neighborhoodId: outOfWardNeighborhood._id,
                createdByUserId: owner._id,
            },
        ]);
        await PcccCheck.create([
            {
                houseId: inWardHouse._id,
                riskLevel: "do",
                inspectionDate: new Date(),
                inspectorId: official._id,
            },
            {
                houseId: outOfWardHouse._id,
                riskLevel: "do",
                inspectionDate: new Date(),
                inspectorId: official._id,
            },
        ]);

        const response = await getDashboardRoute(
            makeRequest("/api/reports/dashboard", {
                headers: await authHeaders(official),
            }),
        );
        const body = await readJson(response);

        expect(response.status).toBe(200);
        expect(body.data.scopeLabel).toBe("Phường thử nghiệm");
        expect(body.data.totalHouses).toBe(1);
        expect(body.data.totalHouseholds).toBe(1);
        expect(body.data.newComplaints).toBe(1);
        expect(body.data.highRiskPcccCount).toBe(1);
        expect(body.data.charts.populationByArea).toEqual([
            expect.objectContaining({ label: "Tổ trong Phường", households: 1 }),
        ]);
    });
});
