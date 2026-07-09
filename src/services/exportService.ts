import ExcelJS from "exceljs";
import { Household, Citizen, Complaint } from "@/models";
import {
    LOAI_SO_HUU_LABEL,
    GIOI_TINH_LABEL,
    LOAI_CU_TRU_LABEL,
    NHOM_PHAN_ANH_LABEL,
    TRANG_THAI_PHAN_ANH_LABEL,
} from "@/types";

function yesNo(value: boolean): string {
    return value ? "Có" : "Không";
}

function formatDate(value?: Date | null): string {
    if (!value) return "";
    return value.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Export ho dan - cot khop voi dinh dang import trong importService.ts
// (Cụm dân cư | Địa chỉ | Chủ hộ | Số điện thoại | Số nhân khẩu | Loại sở hữu
// | Cần hỗ trợ | Ghi chú), co them cot "Mã hộ" vi day la du lieu da co san.
// ---------------------------------------------------------------------------
export async function exportHouseholdsToExcel(): Promise<ExcelJS.Workbook> {
    const households = await Household.find().sort({ code: 1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Ho dan");
    worksheet.columns = [
        { header: "Mã hộ", key: "code", width: 12 },
        { header: "Cụm dân cư", key: "cluster", width: 20 },
        { header: "Địa chỉ", key: "address", width: 30 },
        { header: "Chủ hộ", key: "headOfHousehold", width: 25 },
        { header: "Số điện thoại", key: "phone", width: 15 },
        { header: "Số nhân khẩu", key: "memberCount", width: 15 },
        { header: "Loại sở hữu", key: "ownershipType", width: 15 },
        { header: "Cần hỗ trợ", key: "needsSupport", width: 12 },
        { header: "Ghi chú", key: "note", width: 30 },
    ];
    worksheet.getRow(1).font = { bold: true };

    for (const h of households) {
        worksheet.addRow({
            code: h.code,
            cluster: h.cluster,
            address: h.address,
            headOfHousehold: h.headOfHousehold,
            phone: h.phone || "",
            memberCount: h.memberCount,
            ownershipType: LOAI_SO_HUU_LABEL[h.ownershipType],
            needsSupport: yesNo(h.needsSupport),
            note: h.note || "",
        });
    }

    return workbook;
}

// ---------------------------------------------------------------------------
// Export nhan khau - populate householdId de lay ma ho hien thi trong cot "Mã hộ".
// ---------------------------------------------------------------------------
export async function exportCitizensToExcel(): Promise<ExcelJS.Workbook> {
    const citizens = await Citizen.find()
        .populate("householdId", "code")
        .sort({ fullName: 1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Nhan khau");
    worksheet.columns = [
        { header: "Họ tên", key: "fullName", width: 25 },
        { header: "Số điện thoại", key: "phone", width: 15 },
        { header: "CCCD", key: "cccd", width: 15 },
        { header: "Ngày sinh", key: "birthDate", width: 15 },
        { header: "Giới tính", key: "gender", width: 12 },
        { header: "Quan hệ với chủ hộ", key: "relationToHead", width: 20 },
        { header: "Mã hộ", key: "householdCode", width: 12 },
        { header: "Thường trú/Tạm trú", key: "residenceType", width: 18 },
        { header: "Người cao tuổi", key: "isElderly", width: 15 },
        { header: "Trẻ em", key: "isChild", width: 12 },
        {
            header: "Người khuyết tật",
            key: "isDisabledOrSupportNeeded",
            width: 18,
        },
        { header: "Đảng viên", key: "isPartyMember", width: 12 },
        { header: "Đoàn viên", key: "isUnionMember", width: 12 },
    ];
    worksheet.getRow(1).font = { bold: true };

    for (const c of citizens) {
        const household = c.householdId as unknown as { code?: string } | null;
        worksheet.addRow({
            fullName: c.fullName,
            phone: c.phone || "",
            cccd: c.cccd || "",
            birthDate: formatDate(c.birthDate),
            gender: GIOI_TINH_LABEL[c.gender],
            relationToHead: c.relationToHead || "",
            householdCode: household?.code || "",
            residenceType: LOAI_CU_TRU_LABEL[c.residenceType],
            isElderly: yesNo(c.isElderly),
            isChild: yesNo(c.isChild),
            isDisabledOrSupportNeeded: yesNo(c.isDisabledOrSupportNeeded),
            isPartyMember: yesNo(c.isPartyMember),
            isUnionMember: yesNo(c.isUnionMember),
        });
    }

    return workbook;
}

// ---------------------------------------------------------------------------
// Export phan anh kien nghi, loc theo khoang thoi gian tao (createdAt) neu co.
// ---------------------------------------------------------------------------
export async function exportComplaintsToExcel(params: {
    fromDate?: Date;
    toDate?: Date;
}): Promise<ExcelJS.Workbook> {
    const filter: Record<string, unknown> = {};
    if (params.fromDate || params.toDate) {
        const range: Record<string, Date> = {};
        if (params.fromDate) range.$gte = params.fromDate;
        if (params.toDate) range.$lte = params.toDate;
        filter.createdAt = range;
    }

    const complaints = await Complaint.find(filter).sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Phan anh");
    worksheet.columns = [
        { header: "Mã phản ánh", key: "code", width: 20 },
        { header: "Nhóm phản ánh", key: "category", width: 22 },
        { header: "Tiêu đề", key: "title", width: 30 },
        { header: "Trạng thái", key: "status", width: 20 },
        { header: "Ngày tạo", key: "createdAt", width: 15 },
        { header: "Ngày hoàn thành", key: "actualCompletionDate", width: 18 },
    ];
    worksheet.getRow(1).font = { bold: true };

    for (const c of complaints) {
        worksheet.addRow({
            code: c.code,
            category: NHOM_PHAN_ANH_LABEL[c.category],
            title: c.title,
            status: TRANG_THAI_PHAN_ANH_LABEL[c.status],
            createdAt: formatDate(c.createdAt),
            actualCompletionDate: formatDate(c.actualCompletionDate),
        });
    }

    return workbook;
}
