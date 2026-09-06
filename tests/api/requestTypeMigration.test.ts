import { describe, it, expect } from "vitest";
import { RequestTypeDefinition } from "@/models";
import {
    POST as createRequestTypeRoute,
    GET as listRequestTypesRoute,
} from "@/app/api/request-types/route";
import {
    PATCH as updateRequestTypeRoute,
    DELETE as archiveRequestTypeRoute,
} from "@/app/api/request-types/[id]/route";
import { GET as getMetaRoute } from "@/app/api/requests/meta/route";
import { POST as createRequestRoute } from "@/app/api/requests/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

/**
 * Kiem tra migration "gop loai nhiem vu built-in (pccc/security/other/task)
 * vao chung RequestTypeDefinition" - tap trung vao 2 diem nguy hiem nhat da
 * phat hien luc len ke hoach:
 * 1. assertDefinitionInScope KHONG duoc ap dung cho ban ghi isBuiltIn=true
 *    (built-in luon co wardCode rong, se 403 SAI voi MOI nguoi gui khong
 *    phai admin neu ap dung nham).
 * 2. definitionScope/listRequestTypeDefinitions phai van hien built-in cho
 *    nguoi dung co wardCode, va khong bi ro ri scope giua cac phuong/xa khi
 *    tim kiem (loi $or bi ghi de).
 */

async function seedBuiltInType(overrides: Partial<Record<string, unknown>> = {}) {
    return RequestTypeDefinition.create({
        key: "pccc_fake",
        name: "PCCC (giả lập)",
        fields: [],
        allowedSenderRoles: ["secretary"],
        allowedReceiverRoles: ["regional_police"],
        dataEntryMode: "sender",
        isBuiltIn: true,
        active: true,
        ...overrides,
    });
}

describe("Migration loại nhiệm vụ built-in -> RequestTypeDefinition", () => {
    it("người dùng có wardCode vẫn thấy loại built-in (không bị lọc mất bởi definitionScope)", async () => {
        const secretary = await createTestUser({
            roles: ["secretary"],
            wardCode: 100,
        });
        await seedBuiltInType({ allowedSenderRoles: ["secretary"] });

        const metaRes = await getMetaRoute(
            makeRequest("/api/requests/meta", {
                headers: await authHeaders(secretary),
            }),
        );
        expect(metaRes.status).toBe(200);
        const meta = (await readJson(metaRes)).data;
        expect(meta.allowedTypes).toContain("pccc_fake");
        expect(
            meta.typeDefinitions.some((d: { key: string }) => d.key === "pccc_fake"),
        ).toBe(true);
    });

    it("người gửi thuộc allowedSenderRoles gửi được yêu cầu loại built-in (assertDefinitionInScope không áp dụng sai)", async () => {
        const secretary = await createTestUser({
            roles: ["secretary"],
            wardCode: 100,
        });
        const officer = await createTestUser({ roles: ["regional_police"] });
        await seedBuiltInType({
            allowedSenderRoles: ["secretary"],
            allowedReceiverRoles: ["regional_police"],
        });

        const res = await createRequestRoute(
            makeRequest("/api/requests", {
                method: "POST",
                headers: await authHeaders(secretary),
                body: {
                    type: "pccc_fake",
                    title: "Kiểm tra PCCC",
                    targetUserIds: [String(officer._id)],
                },
            }),
        );
        expect(res.status).toBe(201);
    });

    it("người gửi KHÔNG thuộc allowedSenderRoles bị từ chối 403", async () => {
        const outsider = await createTestUser({ roles: ["house_owner"] });
        const officer = await createTestUser({ roles: ["regional_police"] });
        await seedBuiltInType({
            allowedSenderRoles: ["secretary"],
            allowedReceiverRoles: ["regional_police"],
        });

        const res = await createRequestRoute(
            makeRequest("/api/requests", {
                method: "POST",
                headers: await authHeaders(outsider),
                body: {
                    type: "pccc_fake",
                    title: "Kiểm tra PCCC",
                    targetUserIds: [String(officer._id)],
                },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("admin bỏ qua allowedSenderRoles ở cả bước liệt kê (meta) và bước gửi thực tế", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const officer = await createTestUser({ roles: ["regional_police"] });
        await seedBuiltInType({
            allowedSenderRoles: ["secretary"], // "admin" khong nam trong danh sach
            allowedReceiverRoles: ["regional_police"],
        });

        const metaRes = await getMetaRoute(
            makeRequest("/api/requests/meta", { headers: await authHeaders(admin) }),
        );
        const meta = (await readJson(metaRes)).data;
        expect(meta.allowedTypes).toContain("pccc_fake");

        const createRes = await createRequestRoute(
            makeRequest("/api/requests", {
                method: "POST",
                headers: await authHeaders(admin),
                body: {
                    type: "pccc_fake",
                    title: "Kiểm tra PCCC (admin gửi thay)",
                    targetUserIds: [String(officer._id)],
                },
            }),
        );
        expect(createRes.status).toBe(201);
    });

    it("getRequestMeta lấy eligibleRolesByType trực tiếp từ allowedReceiverRoles của định nghĩa, không qua permission '${type}.assign' cũ", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        // "content_writer" khong phai vai tro giu quyen "pccc.assign" thuc su -
        // neu code cu (dua vao permission) con chay, eligibleRolesByType se
        // KHONG chua vai tro nay.
        await seedBuiltInType({
            allowedSenderRoles: ["secretary"],
            allowedReceiverRoles: ["content_writer_test_role"],
        });

        const metaRes = await getMetaRoute(
            makeRequest("/api/requests/meta", { headers: await authHeaders(secretary) }),
        );
        const meta = (await readJson(metaRes)).data;
        expect(meta.eligibleRolesByType.pccc_fake).toEqual(["content_writer_test_role"]);
    });

    it("tạo loại nhiệm vụ mới trùng mã với loại built-in vẫn bị từ chối 409", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await seedBuiltInType({ key: "pccc" });

        const res = await createRequestTypeRoute(
            makeRequest("/api/request-types", {
                method: "POST",
                headers: await authHeaders(admin),
                body: {
                    key: "pccc",
                    name: "Trùng mã",
                    allowedSenderRoles: ["secretary"],
                    allowedReceiverRoles: ["regional_police"],
                },
            }),
        );
        expect(res.status).toBe(409);
    });

    it("tìm kiếm loại nhiệm vụ không rò rỉ dữ liệu giữa các phường/xã (lỗi $or bị ghi đè)", async () => {
        const secretaryWardA = await createTestUser({
            roles: ["secretary"],
            wardCode: 100,
        });
        await RequestTypeDefinition.create({
            key: "custom_ward_b",
            name: "Loại riêng phường B",
            fields: [],
            allowedSenderRoles: ["secretary"],
            allowedReceiverRoles: ["regional_police"],
            dataEntryMode: "sender",
            isBuiltIn: false,
            active: true,
            wardCode: 200,
        });

        const res = await listRequestTypesRoute(
            makeRequest("/api/request-types?search=custom_ward_b", {
                headers: await authHeaders(secretaryWardA),
            }),
        );
        const list = (await readJson(res)).data;
        expect(
            list.items.some((item: { key: string }) => item.key === "custom_ward_b"),
        ).toBe(false);
    });

    it("chỉ admin sửa/khóa được loại built-in, người quản lý không phải admin bị 403", async () => {
        const secretary = await createTestUser({
            roles: ["secretary"],
            wardCode: 100,
        });
        const admin = await createTestUser({ roles: ["admin"] });
        const builtIn = await seedBuiltInType();

        const patchAsSecretaryRes = await updateRequestTypeRoute(
            makeRequest(`/api/request-types/${builtIn._id}`, {
                method: "PATCH",
                headers: await authHeaders(secretary),
                body: { name: "Đổi tên" },
            }),
            { params: { id: String(builtIn._id) } },
        );
        expect(patchAsSecretaryRes.status).toBe(403);

        const patchAsAdminRes = await updateRequestTypeRoute(
            makeRequest(`/api/request-types/${builtIn._id}`, {
                method: "PATCH",
                headers: await authHeaders(admin),
                body: { name: "Đổi tên" },
            }),
            { params: { id: String(builtIn._id) } },
        );
        expect(patchAsAdminRes.status).toBe(200);

        const archiveAsSecretaryRes = await archiveRequestTypeRoute(
            makeRequest(`/api/request-types/${builtIn._id}`, {
                method: "DELETE",
                headers: await authHeaders(secretary),
            }),
            { params: { id: String(builtIn._id) } },
        );
        expect(archiveAsSecretaryRes.status).toBe(403);
    });
});
