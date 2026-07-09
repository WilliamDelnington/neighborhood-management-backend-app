import type { Model } from "mongoose";

/**
 * Sinh ma tuan tu dang PREFIX + so thu tu can 0, vi du HB001, HB002.
 * Dem tren so luong document hien co (+1), retry neu trung do race condition hiem gap.
 */
export async function generateSequentialCode(
    model: Model<any>,
    prefix: string,
    padLength = 3,
): Promise<string> {
    const count = await model.countDocuments();
    let seq = count + 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const code = `${prefix}${String(seq).padStart(padLength, "0")}`;
        // eslint-disable-next-line no-await-in-loop
        const existed = await model.exists({ code });
        if (!existed) return code;
        seq += 1;
    }
}

/**
 * Sinh ma phan anh dang HB-PA-YYYY-0001, danh so lai theo tung nam.
 */
export async function generateYearlyCode(
    model: Model<any>,
    prefix: string,
    field = "code",
    padLength = 4,
): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `${prefix}-${year}-`;
    const count = await model.countDocuments({
        [field]: { $regex: `^${yearPrefix}` },
    });
    let seq = count + 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const code = `${yearPrefix}${String(seq).padStart(padLength, "0")}`;
        // eslint-disable-next-line no-await-in-loop
        const existed = await model.exists({ [field]: code });
        if (!existed) return code;
        seq += 1;
    }
}

export function toObjectId(value: unknown): string | undefined {
    if (!value) return undefined;
    return String(value);
}
