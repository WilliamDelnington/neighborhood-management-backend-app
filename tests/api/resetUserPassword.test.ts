import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { POST as resetPasswordRoute } from "@/app/api/users/[id]/reset-password/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { User } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createNeighborhood(
    adminHeaders: Record<string, string>,
    code: string,
    sequence: number,
) {
    const res = await createNeighborhoodRoute(
        makeRequest("/api/neighborhoods", {
            method: "POST",
            headers: adminHeaders,
            body: {
                name: `Tổ dân phố ${code}`, code, sequence,
                provinceCode: 79, provinceName: "TP Hồ Chí Minh",
                wardCode: 26734, wardName: "Phường thử nghiệm",
            },
        }),
    );
    return (await readJson(res)).data;
}

async function createOwnedHouse(
    ownerHeaders: Record<string, string>,
    neighborhoodId: string,
    address: string,
) {
    const res = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers: ownerHeaders,
            body: { cluster: "Cụm chung", address, neighborhoodId },
        }),
    );
    return (await readJson(res)).data;
}

async function resetPassword(
    actorHeaders: Record<string, string>,
    targetId: string,
    password: string,
) {
    const res = await resetPasswordRoute(
        makeRequest(`/api/users/${targetId}/reset-password`, {
            method: "POST",
            headers: actorHeaders,
            body: { password },
        }),
        { params: { id: targetId } },
    );
    return { res, json: await readJson(res) };
}

async function login(phone: string, password: string) {
    const res = await loginRoute(
        makeRequest("/api/auth/login", {
            method: "POST",
            body: { phone, password },
        }),
    );
    return { res, json: await readJson(res) };
}

describe("Dat lai mat khau cho tai khoan khac (admin/to truong reset-password)", () => {
    it("admin dat lai mat khau cho tai khoan khong co mat khau (vd tao qua Nhap Excel) -> dang nhap duoc bang mat khau moi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const owner = await createTestUser({
            roles: ["house_owner"],
            phone: "0911222333",
        });
        expect(owner.passwordHash).toBeUndefined();

        const { res } = await resetPassword(adminHeaders, String(owner._id), "matkhaumoi123");
        expect(res.status).toBe(200);

        const { res: loginRes, json: loginJson } = await login(
            "0911222333",
            "matkhaumoi123",
        );
        expect(loginRes.status).toBe(200);
        expect(loginJson.data.user.id).toBe(String(owner._id));
    });

    it("dat lai mat khau se tang sessionVersion, vo hieu hoa phien dang nhap cu", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const owner = await createTestUser({
            roles: ["house_owner"],
            phone: "0911222444",
        });
        const oldOwnerHeaders = await authHeaders(owner);

        await resetPassword(adminHeaders, String(owner._id), "matkhaumoi123");

        const { GET: getMeRoute } = await import("@/app/api/auth/me/route");
        const meRes = await getMeRoute(
            makeRequest("/api/auth/me", { headers: oldOwnerHeaders }),
        );
        expect(meRes.status).toBe(401);
    });

    it("mat khau ngan hon 6 ky tu bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const owner = await createTestUser({ roles: ["house_owner"] });

        const { res } = await resetPassword(adminHeaders, String(owner._id), "123");
        expect(res.status).toBe(422);
    });

    it("to truong dat lai mat khau duoc cho chu nha thuoc to dan pho minh phu trach", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "RPW-A1", 401);

        const ownerA = await createTestUser({
            roles: ["house_owner"],
            phone: "0911222555",
        });
        const ownerAHeaders = await authHeaders(ownerA);
        await createOwnedHouse(ownerAHeaders, neighborhoodA._id, "Số 1, TDP A");

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);

        const { res } = await resetPassword(
            leaderAHeaders,
            String(ownerA._id),
            "matkhaumoi123",
        );
        expect(res.status).toBe(200);

        const { res: loginRes } = await login("0911222555", "matkhaumoi123");
        expect(loginRes.status).toBe(200);
    });

    it("to truong khong dat lai mat khau duoc cho chu nha ngoai to dan pho minh phu trach (403)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "RPW-A2", 402);
        const neighborhoodB = await createNeighborhood(adminHeaders, "RPW-B2", 403);

        const ownerB = await createTestUser({ roles: ["house_owner"] });
        const ownerBHeaders = await authHeaders(ownerB);
        await createOwnedHouse(ownerBHeaders, neighborhoodB._id, "Số 1, TDP B");

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);

        const { res } = await resetPassword(
            leaderAHeaders,
            String(ownerB._id),
            "matkhaumoi123",
        );
        expect(res.status).toBe(403);
    });

    it("nguoi khong co quyen users.reset_password bi tu choi (403)", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        const secretaryHeaders = await authHeaders(secretary);
        const owner = await createTestUser({ roles: ["house_owner"] });

        const { res } = await resetPassword(
            secretaryHeaders,
            String(owner._id),
            "matkhaumoi123",
        );
        expect(res.status).toBe(403);
    });
});
