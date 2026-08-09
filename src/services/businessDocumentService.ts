import {
    Business,
    BusinessDocument,
    BusinessType,
    FileAsset,
    HouseRecord,
    type IBusiness,
    type IBusinessDocument,
    type IBusinessTypeDocumentRule,
    type IHouseRecord,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { userHasPermission } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import { createNotification } from "@/services/notificationService";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import {
    isHouseOwnerActor,
    resolveActiveHouseOwnerActingUserIds,
} from "@/services/houseOwnershipService";
import type { BusinessDocumentStatus, VerificationStatus } from "@/types";
import type { CreateBusinessDocumentInput } from "@/validators/businessDocument";

async function loadBusinessContext(
    businessId: string,
): Promise<{ business: IBusiness; houseRecord: IHouseRecord }> {
    const business = await Business.findById(businessId);
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);

    const houseRecord = await HouseRecord.findById(business.houseId);
    if (!houseRecord) {
        throw new HttpError("Khong tim thay nha so cua ho kinh doanh nay", 404);
    }
    return { business, houseRecord };
}

/**
 * Nem HttpError(403) neu actor khong co quyen duyet loai giay to theo dong
 * luat cua no. reviewerRoles rong tren dong luat = fallback ve permission
 * "businesses.verify" (giu nguyen hanh vi duyet-tho truoc khi co tinh nang
 * nay). Khong thay the assertHouseRecordInScope - phai goi ca hai.
 */
async function assertReviewerRoleForRule(
    actorUser: IUser,
    rule: IBusinessTypeDocumentRule,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;

    if (rule.reviewerRoles && rule.reviewerRoles.length > 0) {
        const matches = actorUser.roles.some(r =>
            rule.reviewerRoles.includes(r),
        );
        if (!matches) {
            throw new HttpError(
                "Bạn không có vai trò được phân công duyệt loại giấy tờ này",
                403,
            );
        }
        return;
    }

    if (!(await userHasPermission(actorUser, "businesses.verify"))) {
        throw new HttpError(
            "Bạn không có quyền duyệt/từ chối hộ kinh doanh",
            403,
        );
    }
}

async function getRuleForDocumentType(
    businessTypeId: unknown,
    documentTypeId: string,
): Promise<IBusinessTypeDocumentRule | null> {
    if (!businessTypeId) return null;
    const businessType = await BusinessType.findById(businessTypeId);
    if (!businessType) return null;
    return (
        businessType.requiredDocuments.find(
            r => String(r.documentTypeId) === String(documentTypeId),
        ) || null
    );
}

/**
 * Tinh lai trang thai xac thuc tong quat cua ho kinh doanh tu ket qua duyet
 * cua tung giay to bat buoc. Ham thuan tuy (khong doc/ghi DB) de de kiem thu
 * rieng. "missing" = chua co ban nop nao dang active cho loai giay to bat
 * buoc do. Chi tra ve "pending"/"verified"/"denied" - ham nay chi duoc goi khi
 * business da roi khoi "unverified" (da nop it nhat 1 giay to), va khong bao
 * gio tra ve "unverified"/"locked" (hai trang thai do khong lien quan ket qua
 * duyet giay to).
 */
export function recomputeBusinessStatus(
    requiredRules: IBusinessTypeDocumentRule[],
    docsByDocumentTypeId: Map<string, { status: BusinessDocumentStatus }>,
): VerificationStatus {
    const requiredStatuses: Array<BusinessDocumentStatus | "missing"> =
        requiredRules
            .filter(r => r.isRequired)
            .map(
                r =>
                    docsByDocumentTypeId.get(String(r.documentTypeId))
                        ?.status ?? "missing",
            );

    if (requiredStatuses.includes("rejected")) return "denied";
    if (
        requiredStatuses.length > 0 &&
        requiredStatuses.every(s => s === "approved")
    ) {
        return "verified";
    }
    return "pending";
}

export type RequiredDocumentItem = {
    rule: IBusinessTypeDocumentRule;
    activeDocument: IBusinessDocument | null;
    history: IBusinessDocument[];
    missing: boolean;
    expired: boolean;
};

/**
 * Tra ve ma tran yeu cau giay to da gop voi tinh trang nop/duyet hien tai -
 * dung cho ca man checklist cua chu ho lan man duyet cua nguoi phu trach.
 * Quyen xem: chu nha lien ket (assertHouseRecordInScope tu bypass cho chu
 * nha) hoac nhan vien trong pham vi cum (permission "businesses.read" da
 * duoc kiem o tang route).
 */
export async function getRequiredDocuments(
    actorUser: IUser,
    businessId: string,
): Promise<{ business: IBusiness; items: RequiredDocumentItem[] }> {
    const { business, houseRecord } = await loadBusinessContext(businessId);
    await assertHouseRecordInScope(actorUser, houseRecord);

    const businessType = business.businessType
        ? await BusinessType.findById(business.businessType).populate(
              "requiredDocuments.documentTypeId",
          )
        : null;
    const rules = businessType?.requiredDocuments ?? [];

    const allDocs = await BusinessDocument.find({ businessId })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName")
        .populate("reviewedBy", "displayName")
        .populate("fileAssetId", "name url mimeType sizeBytes");

    const now = Date.now();
    const items: RequiredDocumentItem[] = rules.map(rule => {
        // rule.documentTypeId da duoc populate thanh DocumentType day du o
        // tren (de tra ve ten/ma cho client) - phai lay lai _id truoc khi so
        // sanh, neu khong String() tren ca mot document se khong khop voi
        // BusinessDocument.documentTypeId (van la ObjectId tho).
        const ruleDocumentTypeId = (rule.documentTypeId as any)?._id
            ? String((rule.documentTypeId as any)._id)
            : String(rule.documentTypeId);
        const docsForType = allDocs.filter(
            d => String(d.documentTypeId) === ruleDocumentTypeId,
        );
        const activeDocument =
            docsForType.find(d => d.active) || null;
        const history = docsForType.filter(d => !d.active);
        const expired = !!(
            activeDocument?.expiryDate &&
            activeDocument.expiryDate.getTime() < now
        );
        return {
            rule,
            activeDocument,
            history,
            missing: !activeDocument,
            expired,
        };
    });

    return { business, items };
}

/**
 * Chu ho (hoac admin) nop mot giay to cho ho kinh doanh cua minh. File phai
 * da duoc tai len truoc qua /api/uploads (relatedModel "BusinessDocument",
 * relatedId = businessId) boi chinh actor nay. Ban nop cu cung
 * (businessId, documentTypeId) neu co se bi chuyen active=false (KHONG xoa)
 * de giu lich su - xem BusinessDocument model.
 */
export async function createBusinessDocument(
    actorUser: IUser,
    businessId: string,
    input: CreateBusinessDocumentInput,
): Promise<IBusinessDocument> {
    const { business, houseRecord } = await loadBusinessContext(businessId);

    const isAdmin = actorUser.roles.includes("admin");
    const isOwner = await isHouseOwnerActor(houseRecord._id, actorUser._id);
    if (!isAdmin && !isOwner) {
        throw new HttpError(
            "Chỉ chủ hộ kinh doanh mới được nộp giấy tờ",
            403,
        );
    }

    // Chi duoc nop giay to khi ho kinh doanh dang "unverified" (chua nop lan
    // nao) hoac "pending" (dang cho duyet) - "verified"/"denied"/"locked" phai
    // qua transitionBusinessStatus ("denied" -> "pending") truoc khi nop lai
    // duoc (xem businessService.transitionBusinessStatus).
    if (!isAdmin && !["unverified", "pending"].includes(business.status)) {
        throw new HttpError(
            "Hộ kinh doanh không ở trạng thái cho phép nộp giấy tờ",
            403,
        );
    }

    const rule = await getRuleForDocumentType(
        business.businessType,
        input.documentTypeId,
    );
    if (!rule) {
        throw new HttpError(
            "Loại giấy tờ này không nằm trong danh mục yêu cầu của loại hình kinh doanh",
            400,
        );
    }

    const fileAsset = await FileAsset.findById(input.fileAssetId);
    if (
        !fileAsset ||
        fileAsset.relatedModel !== "BusinessDocument" ||
        String(fileAsset.relatedId) !== String(businessId) ||
        String(fileAsset.uploadedBy) !== String(actorUser._id)
    ) {
        throw new HttpError(
            "File tải lên không hợp lệ hoặc không thuộc về hộ kinh doanh này",
            400,
        );
    }

    await BusinessDocument.updateMany(
        { businessId, documentTypeId: input.documentTypeId, active: true },
        { $set: { active: false } },
    );

    const businessDocument = await BusinessDocument.create({
        businessId,
        documentTypeId: input.documentTypeId,
        fileAssetId: input.fileAssetId,
        docNumber: input.docNumber,
        issueDate: input.issueDate,
        expiryDate: input.expiryDate,
        status: "pending",
        uploadedBy: actorUser._id,
        active: true,
    });

    if (business.status === "unverified") {
        business.status = "pending";
        business.updatedBy = actorUser._id as any;
        await business.save();
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business_document.upload",
        targetModel: "BusinessDocument",
        targetId: businessDocument._id,
        metadata: { businessId, documentTypeId: input.documentTypeId },
    });

    return businessDocument;
}

/**
 * Nguoi phu trach (dung vai tro theo dong luat, hoac fallback
 * businesses.verify) duyet/tu choi mot giay to dang cho duyet, roi tinh lai
 * trang thai tong quat cua ho kinh doanh.
 */
export async function reviewBusinessDocument(
    actorUser: IUser,
    businessId: string,
    documentId: string,
    decision: "approved" | "rejected",
    rejectionReason?: string,
    approvalNote?: string,
): Promise<IBusinessDocument> {
    const { business, houseRecord } = await loadBusinessContext(businessId);

    const businessDocument = await BusinessDocument.findOne({
        _id: documentId,
        businessId,
        active: true,
    });
    if (!businessDocument) {
        throw new HttpError("Không tìm thấy giấy tờ đang chờ duyệt", 404);
    }

    const rule = await getRuleForDocumentType(
        business.businessType,
        String(businessDocument.documentTypeId),
    );
    if (!rule) {
        throw new HttpError(
            "Loại giấy tờ này không còn nằm trong danh mục yêu cầu, không thể duyệt",
            400,
        );
    }

    if (!actorUser.roles.includes("admin")) {
        await assertHouseRecordInScope(actorUser, houseRecord);
    }
    await assertReviewerRoleForRule(actorUser, rule);

    businessDocument.status = decision;
    businessDocument.rejectionReason =
        decision === "rejected" ? rejectionReason : undefined;
    businessDocument.approvalNote =
        decision === "approved" ? approvalNote : undefined;
    businessDocument.reviewedBy = actorUser._id as any;
    businessDocument.reviewedAt = new Date();
    await businessDocument.save();

    const previousStatus = business.status;
    const businessType = business.businessType
        ? await BusinessType.findById(business.businessType)
        : null;
    const requiredRules = businessType?.requiredDocuments ?? [];
    const activeDocs = await BusinessDocument.find({
        businessId,
        active: true,
    });
    const docsByType = new Map(
        activeDocs.map(d => [String(d.documentTypeId), d]),
    );

    const nextStatus = recomputeBusinessStatus(requiredRules, docsByType);
    business.status = nextStatus;
    business.updatedBy = actorUser._id as any;
    await business.save();

    const ownerActingUserIds = await resolveActiveHouseOwnerActingUserIds(
        houseRecord._id,
    );
    if (ownerActingUserIds.length && previousStatus !== nextStatus) {
        if (decision === "rejected") {
            await createNotification({
                title: "Giấy tờ cần bổ sung",
                body: `Một giấy tờ của hộ kinh doanh ${business.name} bị từ chối: ${rejectionReason}`,
                type: "business_document.rejected",
                targetUserIds: ownerActingUserIds,
                relatedModel: "Business",
                relatedId: business._id,
                createdBy: actorUser._id,
            });
        }
        if (nextStatus === "verified") {
            await createNotification({
                title: "Kết quả xác thực hộ kinh doanh",
                body: `Hộ kinh doanh ${business.name} của bạn đã được xác thực${
                    approvalNote ? `: ${approvalNote}` : ""
                }`,
                type: "business.status_changed",
                targetUserIds: ownerActingUserIds,
                relatedModel: "Business",
                relatedId: business._id,
                createdBy: actorUser._id,
            });
        }
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business_document.review",
        targetModel: "BusinessDocument",
        targetId: businessDocument._id,
        metadata: {
            decision,
            documentTypeId: String(businessDocument.documentTypeId),
            previousBusinessStatus: previousStatus,
            newBusinessStatus: nextStatus,
            rejectionReason,
            approvalNote,
        },
    });

    return businessDocument;
}
