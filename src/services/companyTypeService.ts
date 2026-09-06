import { CompanyType, Company, type ICompanyType } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateCompanyTypeInput,
    UpdateCompanyTypeInput,
} from "@/validators/companyType";

export async function listCompanyTypes(
    params: {
        search?: string;
        active?: boolean;
        page?: number;
        limit?: number;
    } = {},
) {
    const filter: Record<string, unknown> = {};
    if (params.active !== undefined) filter.active = params.active;
    if (params.search) {
        filter.name = { $regex: params.search, $options: "i" };
    }
    const page = params.page || 1;
    const limit = params.limit || 10;

    const [items, total] = await Promise.all([
        CompanyType.find(filter)
            .sort({ sortOrder: 1, name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        CompanyType.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getCompanyTypeById(id: string): Promise<ICompanyType> {
    const companyType = await CompanyType.findById(id);
    if (!companyType) {
        throw new HttpError("Không tìm thấy loại hình doanh nghiệp", 404);
    }
    return companyType;
}

export async function createCompanyType(
    actorId: string,
    input: CreateCompanyTypeInput,
) {
    const existing = await CompanyType.findOne({ name: input.name });
    if (existing) {
        throw new HttpError("Tên loại hình doanh nghiệp đã tồn tại", 409);
    }

    const companyType = await CompanyType.create({
        ...input,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "company_type.create",
        targetModel: "CompanyType",
        targetId: companyType._id,
        metadata: { name: companyType.name },
    });

    return companyType;
}

export async function updateCompanyType(
    actorId: string,
    id: string,
    input: UpdateCompanyTypeInput,
) {
    const companyType = await getCompanyTypeById(id);

    if (input.name !== undefined && input.name !== companyType.name) {
        const existing = await CompanyType.findOne({
            name: input.name,
            _id: { $ne: id },
        });
        if (existing) {
            throw new HttpError("Tên loại hình doanh nghiệp đã tồn tại", 409);
        }
        companyType.name = input.name;
    }
    if (input.description !== undefined) {
        companyType.description = input.description;
    }
    if (input.active !== undefined) companyType.active = input.active;
    if (input.sortOrder !== undefined) companyType.sortOrder = input.sortOrder;
    companyType.updatedBy = actorId as any;
    await companyType.save();

    await writeAuditLog({
        actorId,
        action: "company_type.update",
        targetModel: "CompanyType",
        targetId: companyType._id,
        metadata: { name: companyType.name, active: companyType.active },
    });

    return companyType;
}

export async function deleteCompanyType(actorId: string, id: string) {
    const companyType = await getCompanyTypeById(id);

    const assignedCompanyCount = await Company.countDocuments({
        companyTypeId: id,
    });
    if (assignedCompanyCount > 0) {
        throw new HttpError(
            "Loại hình doanh nghiệp đang được công ty sử dụng, vui lòng chuyển sang loại khác trước khi xóa",
            409,
        );
    }

    await CompanyType.findByIdAndDelete(id);

    await writeAuditLog({
        actorId,
        action: "company_type.delete",
        targetModel: "CompanyType",
        targetId: id,
        metadata: { name: companyType.name },
    });

    return { _id: id };
}
