import { describe, expect, it } from "vitest";
import { POST as createHouse } from "@/app/api/houses/route";
import { PATCH as updateHouseGis } from "@/app/api/houses/[id]/gis/route";
import {
    GET as listRequestTypes,
    POST as createRequestType,
} from "@/app/api/request-types/route";
import { POST as createRequest } from "@/app/api/requests/route";
import { PATCH as updateRequestFormData } from "@/app/api/requests/[id]/form-data/route";
import { User } from "@/models";
import { authHeaders, createTestUser, makeRequest, readJson } from "../helpers";

describe("Nen tang GIS, danh tinh va nhiem vu dong", () => {
    it("coi 0/0 la chua co GIS va luu GeoJSON dung thu tu khi co GPS that", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const headers = await authHeaders(owner);
        const createdResponse = await createHouse(
            makeRequest("/api/houses", {
                method: "POST",
                headers,
                body: { cluster: "Cum GIS", address: "So 10" },
            }),
        );
        const created = (await readJson(createdResponse)).data;

        const zeroResponse = await updateHouseGis(
            makeRequest(`/api/houses/${created._id}/gis`, {
                method: "PATCH",
                headers,
                body: {
                    gisLatitude: 0,
                    gisLongitude: 0,
                    gisSource: "manual",
                },
            }),
            { params: { id: created._id } },
        );
        const zero = (await readJson(zeroResponse)).data;
        expect(zero.gisLatitude).toBeNull();
        expect(zero.gisLongitude).toBeNull();
        expect(zero.gisSource).toBe("unavailable");
        expect(zero.location).toBeUndefined();

        const gpsResponse = await updateHouseGis(
            makeRequest(`/api/houses/${created._id}/gis`, {
                method: "PATCH",
                headers,
                body: {
                    gisLatitude: 10.7769,
                    gisLongitude: 106.7009,
                    gisAccuracyMeters: 8,
                    gisSource: "device_gps",
                },
            }),
            { params: { id: created._id } },
        );
        const gps = (await readJson(gpsResponse)).data;
        expect(gps.location).toEqual({
            type: "Point",
            coordinates: [106.7009, 10.7769],
        });
        expect(gps.gisSource).toBe("device_gps");
    });

    it("gan tai khoan so dien thoai nhan chua xac minh quoc gia", async () => {
        const user = await createTestUser({
            roles: ["house_owner"],
            phone: "0912345678",
        });
        const stored = await User.findById(user._id);
        expect(stored?.identityProvider).toBe("phone_temporary");
        expect(stored?.identityVerificationStatus).toBe("unverified");
    });

    it("tao loai nhiem vu moi, ma hoa payload va cho nguoi nhan nop bieu mau", async () => {
        const wardOfficer = await createTestUser({
            roles: ["people_committee_official"],
            wardCode: 26734,
            wardName: "Phuong thu nghiem",
        });
        const receiver = await createTestUser({
            roles: ["neighborhood_leader"],
        });
        const officerHeaders = await authHeaders(wardOfficer);
        const receiverHeaders = await authHeaders(receiver);

        const typeResponse = await createRequestType(
            makeRequest("/api/request-types", {
                method: "POST",
                headers: officerHeaders,
                body: {
                    key: "ho_ngheo_2026",
                    name: "Ra soat ho ngheo 2026",
                    allowedSenderRoles: ["people_committee_official"],
                    allowedReceiverRoles: ["neighborhood_leader"],
                    dataEntryMode: "recipient",
                    fields: [
                        {
                            key: "thu_nhap",
                            label: "Thu nhap binh quan",
                            type: "number",
                            required: true,
                            options: [],
                            classification: "sensitive",
                        },
                    ],
                },
            }),
        );
        expect(typeResponse.status).toBe(201);

        const listResponse = await listRequestTypes(
            makeRequest("/api/request-types", { headers: officerHeaders }),
        );
        const listed = (await readJson(listResponse)).data.items;
        expect(listed).toHaveLength(1);
        expect(listed[0].version).toBe(1);

        const requestResponse = await createRequest(
            makeRequest("/api/requests", {
                method: "POST",
                headers: officerHeaders,
                body: {
                    type: "ho_ngheo_2026",
                    title: "Thu thap dot 1",
                    targetUserIds: [String(receiver._id)],
                    targetRoles: [],
                },
            }),
        );
        expect(requestResponse.status).toBe(201);
        const request = (await readJson(requestResponse)).data;
        expect(request.formDefinitionSnapshot.name).toBe("Ra soat ho ngheo 2026");
        expect(request.formData).toEqual({});

        const submitResponse = await updateRequestFormData(
            makeRequest(`/api/requests/${request._id}/form-data`, {
                method: "PATCH",
                headers: receiverHeaders,
                body: { formData: { thu_nhap: 3500000 } },
            }),
            { params: { id: request._id } },
        );
        expect(submitResponse.status).toBe(200);
        const submitted = (await readJson(submitResponse)).data;
        expect(submitted.formData).toEqual({ thu_nhap: 3500000 });
        expect(JSON.stringify(submitted)).not.toContain("enc:v1:");
    });
});

