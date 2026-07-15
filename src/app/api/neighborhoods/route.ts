import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { Household, User } from "@/models";

export const dynamic = "force-dynamic";

/**
 * GET /api/neighborhoods
 *
 * Tra ve danh sach ten to dan pho (string[]) de nguoi dan chon khi hoan tat
 * thong tin trong Mini App (NeighborhoodPickerSheet).
 *
 * Endpoint cong khai (khong yeu cau dang nhap) vi duoc goi trong luong onboarding
 * va du lieu (ten to dan pho) khong nhay cam. Neu can, co the bo sung requireUser.
 *
 * Nguon du lieu: gop gia tri `cluster` dang co tren ho dan + cac cum duoc phan
 * cong cho to truong (assignedClusters), loai trung va sap xep theo so thu tu.
 */
export async function GET() {
    try {
        await connectDB();

        const [householdClusters, leaderClusters] = await Promise.all([
            Household.distinct("cluster"),
            User.distinct("assignedClusters", {
                roles: "neighborhood_leader",
            }),
        ]);

        const unique = new Set<string>();
        for (const value of [...householdClusters, ...leaderClusters]) {
            if (typeof value === "string" && value.trim()) {
                unique.add(value.trim());
            }
        }

        const neighborhoods = Array.from(unique).sort((a, b) =>
            a.localeCompare(b, "vi", { numeric: true, sensitivity: "base" }),
        );

        return apiSuccess(neighborhoods);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
