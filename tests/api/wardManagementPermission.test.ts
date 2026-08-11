import { describe, expect, it } from "vitest";
import { GET as listWardManagersRoute } from "@/app/api/wards/managers/route";
import { PATCH as updateUserRoute } from "@/app/api/users/[id]/route";
import { Role as RoleModel } from "@/models";
import { authHeaders, createTestUser, makeRequest, readJson } from "../helpers";

describe("wards.manage permission", () => {
    it("allows ward assignment without granting general user updates", async () => {
        await RoleModel.create({
            key: "ward_manager_test",
            name: "Ward manager test",
            permissions: ["wards.manage"],
            active: true,
        });
        const actor = await createTestUser({
            roles: ["ward_manager_test" as any],
        });
        const secretary = await createTestUser({ roles: ["secretary"] });
        const headers = await authHeaders(actor);

        const listResponse = await listWardManagersRoute(
            makeRequest("/api/wards/managers", { headers }),
        );
        expect(listResponse.status).toBe(200);

        const wardResponse = await updateUserRoute(
            makeRequest(`/api/users/${secretary._id}`, {
                method: "PATCH",
                headers,
                body: {
                    provinceCode: 1,
                    provinceName: "Thành phố Hà Nội",
                    wardCode: 9886,
                    wardName: "Phường thử nghiệm",
                },
            }),
            { params: { id: String(secretary._id) } },
        );
        expect(wardResponse.status).toBe(200);
        expect((await readJson(wardResponse)).data.wardCode).toBe(9886);

        const generalResponse = await updateUserRoute(
            makeRequest(`/api/users/${secretary._id}`, {
                method: "PATCH",
                headers,
                body: { displayName: "Not allowed" },
            }),
            { params: { id: String(secretary._id) } },
        );
        expect(generalResponse.status).toBe(403);
    });
});
