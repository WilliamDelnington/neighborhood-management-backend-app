import { describe, it, expect } from "vitest";
import { createComplaintSchema } from "@/validators/complaint";
import { createHouseholdSchema } from "@/validators/household";
import { registerMeetingSchema } from "@/validators/meeting";
import { respondSurveySchema } from "@/validators/survey";
import { zaloLoginSchema } from "@/validators/auth";

describe("createComplaintSchema", () => {
    it("chap nhan du lieu hop le", () => {
        const result = createComplaintSchema.parse({
            category: "ve_sinh_moi_truong",
            title: "Rác thải tồn đọng",
            content: "Rác không được thu gom nhiều ngày nay.",
        });
        expect(result.category).toBe("ve_sinh_moi_truong");
    });

    it("tu choi khi tieu de qua ngan", () => {
        expect(() =>
            createComplaintSchema.parse({
                category: "khac",
                title: "Aa",
                content: "Noi dung du dai de qua kiem tra.",
            }),
        ).toThrow();
    });

    it("tu choi khi danh muc khong hop le", () => {
        expect(() =>
            createComplaintSchema.parse({
                category: "khong_ton_tai",
                title: "Tieu de hop le",
                content: "Noi dung du dai de qua kiem tra.",
            }),
        ).toThrow();
    });

    it("gioi han toi da 6 anh dinh kem", () => {
        expect(() =>
            createComplaintSchema.parse({
                category: "khac",
                title: "Tieu de hop le",
                content: "Noi dung du dai de qua kiem tra.",
                images: Array.from({ length: 7 }, (_, i) => `img${i}.jpg`),
            }),
        ).toThrow();
    });
});

describe("createHouseholdSchema", () => {
    it("ap dung gia tri mac dinh cho ownershipType va needsSupport", () => {
        const result = createHouseholdSchema.parse({
            cluster: "Cụm 1",
            address: "Số 1, ngõ 12",
            headOfHousehold: "Nguyễn Văn An",
        });
        expect(result.ownershipType).toBe("chinh_chu");
        expect(result.needsSupport).toBe(false);
    });

    it("bo qua memberCount neu client gui len - truong nay do he thong tu tinh", () => {
        const result = createHouseholdSchema.parse({
            cluster: "Cụm 1",
            address: "Số 1, ngõ 12",
            headOfHousehold: "Nguyễn Văn An",
            memberCount: 999,
        } as any);
        expect((result as any).memberCount).toBeUndefined();
    });

    it("tu choi khi thieu dia chi", () => {
        expect(() =>
            createHouseholdSchema.parse({
                cluster: "Cụm 1",
                headOfHousehold: "Nguyễn Văn An",
            }),
        ).toThrow();
    });
});

describe("registerMeetingSchema", () => {
    it("chap nhan dang ky 'co' khong can ten uy quyen", () => {
        const result = registerMeetingSchema.parse({ answer: "co" });
        expect(result.answer).toBe("co");
    });

    it("bat buoc phai co ten nguoi duoc uy quyen khi answer la uy_quyen", () => {
        expect(() =>
            registerMeetingSchema.parse({ answer: "uy_quyen" }),
        ).toThrow();
    });

    it("chap nhan uy_quyen khi co ten nguoi duoc uy quyen", () => {
        const result = registerMeetingSchema.parse({
            answer: "uy_quyen",
            delegateName: "Nguyễn Văn B",
        });
        expect(result.delegateName).toBe("Nguyễn Văn B");
    });
});

describe("respondSurveySchema", () => {
    it("yeu cau it nhat mot cau tra loi", () => {
        expect(() => respondSurveySchema.parse({ answers: [] })).toThrow();
    });

    it("chap nhan danh sach cau tra loi hop le", () => {
        const result = respondSurveySchema.parse({
            answers: [{ questionId: "q1", selectedOptions: ["Đồng ý"] }],
        });
        expect(result.answers).toHaveLength(1);
    });
});

describe("zaloLoginSchema", () => {
    it("tu choi khi thieu accessToken hoac zaloUserId", () => {
        expect(() =>
            zaloLoginSchema.parse({ accessToken: "", zaloUserId: "u1" }),
        ).toThrow();
        expect(() =>
            zaloLoginSchema.parse({ accessToken: "token", zaloUserId: "" }),
        ).toThrow();
    });

    it("chap nhan du lieu dang nhap hop le", () => {
        const result = zaloLoginSchema.parse({
            accessToken: "token",
            zaloUserId: "u1",
        });
        expect(result.zaloUserId).toBe("u1");
    });
});
