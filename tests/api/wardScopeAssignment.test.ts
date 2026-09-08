import { describe, expect, it } from "vitest";
import { GET as listWardManagersRoute } from "@/app/api/wards/managers/route";
import {
    GET as listScopeAssignmentsRoute,
    POST as assignScopeRoute,
} from "@/app/api/scope-assignments/route";
import { POST as unassignScopeRoute } from "@/app/api/scope-assignments/unassign/route";
import { ScopeAssignment } from "@/models";
import { authHeaders, createTestUser, makeRequest, readJson } from "../helpers";

const WARD_CODE = 88123;

describe("Config-driven ward scope assignment", () => {
    it("mot phuong chi co 1 Bi thu active - gan nguoi moi tu dong thay the nguoi cu (van giu lich su)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const secretaryA = await createTestUser({ roles: ["secretary"] });
        const secretaryB = await createTestUser({ roles: ["secretary"] });

        const firstAssign = await assignScopeRoute(
            makeRequest("/api/scope-assignments", {
                method: "POST",
                headers,
                body: {
                    userId: String(secretaryA._id),
                    roleKey: "secretary",
                    scopeType: "WARD",
                    scopeId: WARD_CODE,
                },
            }),
        );
        expect(firstAssign.status).toBe(201);

        const secondAssign = await assignScopeRoute(
            makeRequest("/api/scope-assignments", {
                method: "POST",
                headers,
                body: {
                    userId: String(secretaryB._id),
                    roleKey: "secretary",
                    scopeType: "WARD",
                    scopeId: WARD_CODE,
                },
            }),
        );
        expect(secondAssign.status).toBe(201);

        const activeRows = await ScopeAssignment.find({
            roleKey: "secretary",
            scopeType: "WARD",
            scopeId: WARD_CODE,
            unassignedAt: { $exists: false },
        });
        expect(activeRows).toHaveLength(1);
        expect(String(activeRows[0].userId)).toBe(String(secretaryB._id));

        const historyRows = await ScopeAssignment.find({
            roleKey: "secretary",
            scopeType: "WARD",
            scopeId: WARD_CODE,
        });
        expect(historyRows).toHaveLength(2);
        const closedRow = historyRows.find(
            r => String(r.userId) === String(secretaryA._id),
        );
        expect(closedRow?.unassignedAt).toBeDefined();
    });

    it("mot phuong duoc phep co nhieu Can bo UBND / Cong an khu vuc active cung luc", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const officialA = await createTestUser({ roles: ["people_committee_official"] });
        const officialB = await createTestUser({ roles: ["people_committee_official"] });
        const police = await createTestUser({ roles: ["regional_police"] });

        for (const user of [officialA, officialB, police]) {
            const res = await assignScopeRoute(
                makeRequest("/api/scope-assignments", {
                    method: "POST",
                    headers,
                    body: {
                        userId: String(user._id),
                        roleKey: user.roles[0],
                        scopeType: "WARD",
                        scopeId: WARD_CODE + 1,
                    },
                }),
            );
            expect(res.status).toBe(201);
        }

        const listRes = await listScopeAssignmentsRoute(
            makeRequest(
                `/api/scope-assignments?scopeType=WARD&scopeId=${WARD_CODE + 1}`,
                { headers },
            ),
        );
        const listJson = await readJson(listRes);
        expect(listJson.data).toHaveLength(3);

        const wardManagersRes = await listWardManagersRoute(
            makeRequest("/api/wards/managers", { headers }),
        );
        const wardManagersJson = await readJson(wardManagersRes);
        const policeEntry = wardManagersJson.data.find(
            (u: any) => u.id === String(police._id),
        );
        expect(policeEntry?.wardRoleKey).toBe("regional_police");
    });

    it("unassign go dung ban ghi active theo muc tieu, khong xoa lich su", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const secretary = await createTestUser({ roles: ["secretary"] });

        await assignScopeRoute(
            makeRequest("/api/scope-assignments", {
                method: "POST",
                headers,
                body: {
                    userId: String(secretary._id),
                    roleKey: "secretary",
                    scopeType: "WARD",
                    scopeId: WARD_CODE + 2,
                },
            }),
        );

        const unassignRes = await unassignScopeRoute(
            makeRequest("/api/scope-assignments/unassign", {
                method: "POST",
                headers,
                body: {
                    userId: String(secretary._id),
                    roleKey: "secretary",
                    scopeType: "WARD",
                    scopeId: WARD_CODE + 2,
                },
            }),
        );
        expect(unassignRes.status).toBe(200);

        const rows = await ScopeAssignment.find({
            roleKey: "secretary",
            scopeType: "WARD",
            scopeId: WARD_CODE + 2,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].unassignedAt).toBeDefined();
    });
});
