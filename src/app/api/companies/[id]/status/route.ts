import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { updateCompanyStatusSchema } from "@/validators/company";
import { transitionCompanyStatus } from "@/services/companyService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/companies/:id/status
 * Chuyen trang thai xac thuc thu cong - admin ghi de tuy y, chu ho chi duoc
 * gui lai ("denied" -> "pending"). Khong co quy trinh nop/duyet giay to rieng
 * nhu Business (khong co CompanyDocument) - day la cach duy nhat de doi trang
 * thai cong ty. Loc tho o day (phai co it nhat mot trong hai quyen lien
 * quan), luat chi tiet nam trong transitionCompanyStatus.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, ["companies.update", "companies.verify"]);

        const body = updateCompanyStatusSchema.parse(await req.json());
        const company = await transitionCompanyStatus(
            user,
            params.id,
            body.status,
        );
        return apiSuccess(company, "Cap nhat trang thai cong ty thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
