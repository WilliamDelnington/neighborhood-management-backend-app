import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
    POST as createCitizenRoute,
    GET as listCitizensRoute,
} from "@/app/api/citizens/route";
import { Citizen, Household } from "@/models";
import { isEncryptedSensitive } from "@/lib/encryption";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function setupAdminWithHousehold() {
    const admin = await createTestUser({ roles: ["admin"] });
    const headers = await authHeaders(admin);
    const household = await Household.create({
        code: "HB999",
        cluster: "Cụm Test",
        address: "Số 1, Cụm Test",
        headOfHousehold: "Nguyễn Văn Test",
    });
    return { admin, headers, household };
}

describe("Ma hoa va che sdt/cccd cua Citizen", () => {
    it("luu phone/cccd da ma hoa AES-256-GCM trong DB, khong luu plaintext", async () => {
        const { headers, household } = await setupAdminWithHousehold();

        const res = await createCitizenRoute(
            makeRequest("/api/citizens", {
                method: "POST",
                headers,
                body: {
                    fullName: "Nguyễn Văn A",
                    phone: "0912345678",
                    cccd: "012345678910",
                    householdId: String(household._id),
                },
            }),
        );
        const created = (await readJson(res)).data;

        // Doc truc tiep qua driver Mongo (bo qua Mongoose/post("init")) de kiem
        // tra gia tri thuc su nam trong DB, khong bi giai ma tu dong.
        const rawDoc = await Citizen.collection.findOne({
            _id: new Types.ObjectId(created._id),
        });
        expect(isEncryptedSensitive(rawDoc!.phone)).toBe(true);
        expect(isEncryptedSensitive(rawDoc!.cccd)).toBe(true);
        expect(rawDoc!.phone).not.toContain("0912345678");
        expect(rawDoc!.cccd).not.toContain("012345678910");
        expect(typeof rawDoc!.phoneHash).toBe("string");
        expect(typeof rawDoc!.cccdHash).toBe("string");
    });

    it("che phone/cccd trong JSON response cua API, chi giu lai vai ky tu cuoi", async () => {
        const { headers, household } = await setupAdminWithHousehold();

        const res = await createCitizenRoute(
            makeRequest("/api/citizens", {
                method: "POST",
                headers,
                body: {
                    fullName: "Nguyễn Văn B",
                    phone: "0912345678",
                    cccd: "012345678910",
                    householdId: String(household._id),
                },
            }),
        );
        const created = (await readJson(res)).data;

        expect(created.phone).toBe("*******678");
        expect(created.cccd).toBe("********8910");
        expect(created.phoneHash).toBeUndefined();
        expect(created.cccdHash).toBeUndefined();
    });

    it("tim kiem exact-match theo so dien thoai day du van hoat dong sau khi ma hoa", async () => {
        const { headers, household } = await setupAdminWithHousehold();

        await createCitizenRoute(
            makeRequest("/api/citizens", {
                method: "POST",
                headers,
                body: {
                    fullName: "Nguyễn Văn C",
                    phone: "0987654321",
                    householdId: String(household._id),
                },
            }),
        );

        const fullMatch = await readJson(
            await listCitizensRoute(
                makeRequest("/api/citizens?search=0987654321", { headers }),
            ),
        );
        expect(fullMatch.data.items).toHaveLength(1);
        expect(fullMatch.data.items[0].fullName).toBe("Nguyễn Văn C");

        const partialMatch = await readJson(
            await listCitizensRoute(
                makeRequest("/api/citizens?search=987654", { headers }),
            ),
        );
        expect(partialMatch.data.items).toHaveLength(0);
    });
});
