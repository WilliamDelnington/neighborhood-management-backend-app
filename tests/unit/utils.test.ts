import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { generateSequentialCode, generateYearlyCode } from "@/lib/utils";

const CodeTestModel =
    (mongoose.models.CodeTestItem as mongoose.Model<{ code: string }>) ||
    mongoose.model<{ code: string }>(
        "CodeTestItem",
        new mongoose.Schema({ code: String }),
    );

describe("generateSequentialCode", () => {
    it("sinh ma dau tien dang PREFIX + so thu tu can 0 khi collection rong", async () => {
        const code = await generateSequentialCode(CodeTestModel, "HB", 3);
        expect(code).toBe("HB001");
    });

    it("dem tren so luong ban ghi hien co de sinh ma tiep theo", async () => {
        await CodeTestModel.create({ code: "HB001" });
        const code = await generateSequentialCode(CodeTestModel, "HB", 3);
        expect(code).toBe("HB002");
    });

    it("bo qua ma da ton tai (do du lieu bi khuyet) va thu lai cho den khi tim duoc ma trong", async () => {
        await CodeTestModel.create({ code: "HB001" });
        await CodeTestModel.create({ code: "HB003" });
        // count = 2 -> du doan HB003, nhung HB003 da ton tai nen phai thu tiep len HB004.
        const code = await generateSequentialCode(CodeTestModel, "HB", 3);
        expect(code).toBe("HB004");
    });
});

describe("generateYearlyCode", () => {
    it("sinh ma dau tien theo nam hien tai dang PREFIX-YYYY-0001", async () => {
        const year = new Date().getFullYear();
        const code = await generateYearlyCode(CodeTestModel, "HB-PA");
        expect(code).toBe(`HB-PA-${year}-0001`);
    });

    it("chi dem cac ma trong cung nam, khong bi anh huong boi ma nam khac", async () => {
        const year = new Date().getFullYear();
        await CodeTestModel.create({ code: `HB-PA-${year - 1}-0005` });
        const code = await generateYearlyCode(CodeTestModel, "HB-PA");
        expect(code).toBe(`HB-PA-${year}-0001`);
    });

    it("tang dan so thu tu trong cung nam", async () => {
        const year = new Date().getFullYear();
        await CodeTestModel.create({ code: `HB-PA-${year}-0001` });
        const code = await generateYearlyCode(CodeTestModel, "HB-PA");
        expect(code).toBe(`HB-PA-${year}-0002`);
    });
});
