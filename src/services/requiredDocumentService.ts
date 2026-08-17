import type { Model, Types } from "mongoose";
import {
    DocumentType,
    FileAsset,
    RequiredDocumentSettings,
    type IRequiredDocumentRule,
    type IUser,
    type RequiredDocumentSettingsCategory,
} from "@/models";
import { HttpError } from "@/lib/response";
import { userHasPermission } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import { createNotification } from "@/services/notificationService";
import type {
    CreateDocumentInput,
    PutRequiredDocumentsInput,
} from "@/validators/requiredDocument";

/**
 * Mo ta cach lam viec voi MOT loai ban ghi cu the (House/Household/Company) de
 * requiredDocumentService co the dung chung logic ma khong phai viet lai 3
 * lan. Khac Business (dong luat nam tren BusinessType dung chung cho nhieu
 * Business), o day dong luat AP DUNG CHUNG cho CA MOT LOAI ban ghi (tat ca
 * House, hoac tat ca Household, hoac tat ca Company - xem
 * models/RequiredDocumentSettings.ts) - KHONG khai bao rieng tren tung ban
 * ghi, vi luu tren tung ban ghi ton nhieu thoi gian/dung luong DB khong can
 * thiet (quyet dinh doi lai tu thiet ke ban dau theo yeu cau). `status` cua
 * entity KHONG bi anh huong boi ket qua duyet giay to (khac
 * businessDocumentService.recomputeBusinessStatus) - status van chuyen thu
 * cong qua transitionHouseRecordStatus/transitionHouseholdStatus/
 * transitionCompanyStatus.
 *
 * Pham vi/chu so huu/nguoi duoc thong bao KHONG duoc gia dinh chung (House va
 * Company luon gan voi mot HouseRecord qua houseId bat buoc, nhung Household
 * co the "mo coi" - khong co houseId - va con co them headOfHouseholdUserId
 * rieng) - moi adapter tu quyet dinh dung ham nao (xem
 * requiredDocumentAdapters.ts), service nay chi goi lai qua adapter.
 */
export interface RequiredDocumentAdapter<TEntity = any> {
    label: string;
    notFoundMessage: string;
    // Phai khop mot gia tri trong enum relatedModel cua FileAsset/uploads.
    relatedModelName: string;
    // Fallback permission khi dong luat khong khai bao reviewerRoles.
    verifyPermission: string;
    // Category trong RequiredDocumentSettings ma loai ban ghi nay dung chung.
    category: RequiredDocumentSettingsCategory;
    EntityModel: Model<TEntity>;
    DocumentModel: Model<any>;
    entityIdField: string;
    findEntity(id: string): Promise<TEntity | null>;
    // Nem HttpError(403) neu actor khong duoc phep xem/duyet ban ghi nay
    // (admin/chu so huu lien ket duoc bypass, nhan vien theo pham vi cum).
    assertScope(actorUser: IUser, entity: TEntity): Promise<void>;
    // Actor co phai "chu" cua ban ghi nay khong (duoc nop giay to).
    isOwnerActor(actorUser: IUser, entity: TEntity): Promise<boolean>;
    // Danh sach userId can thong bao khi mot giay to bi tu choi (rong neu
    // khong xac dinh duoc, vd ho dan mo coi).
    resolveNotifyUserIds(entity: TEntity): Promise<(string | Types.ObjectId)[]>;
    // Kieu string (khong ep VerificationStatus) vi HouseRecord.status dung
    // HOUSE_RECORD_STATUS - tap gia tri rong hon (co them "needs_update").
    getStatus(entity: TEntity): string;
}

async function findEntityOrThrow<TEntity>(
    adapter: RequiredDocumentAdapter<TEntity>,
    entityId: string,
): Promise<TEntity> {
    const entity = await adapter.findEntity(entityId);
    if (!entity) throw new HttpError(adapter.notFoundMessage, 404);
    return entity;
}

/**
 * Lay dong luat "giay to bat buoc/tuy chon" AP DUNG CHUNG cho mot category
 * (house/household/company) - tra ve [] neu chua tung thiet lap.
 */
async function getRequiredDocumentRules(
    category: RequiredDocumentSettingsCategory,
    populateDocumentType = false,
): Promise<IRequiredDocumentRule[]> {
    let query = RequiredDocumentSettings.findOne({ category });
    if (populateDocumentType) {
        query = query.populate("requiredDocuments.documentTypeId");
    }
    const settings = await query;
    return settings?.requiredDocuments ?? [];
}

/**
 * Nem HttpError(403) neu actor khong co quyen duyet loai giay to theo dong
 * luat cua no. reviewerRoles rong tren dong luat = fallback ve
 * adapter.verifyPermission (giu nguyen hanh vi duyet-tho truoc khi co tinh
 * nang nay) - giong businessDocumentService.assertReviewerRoleForRule.
 */
async function assertReviewerRoleForRule(
    actorUser: IUser,
    rule: IRequiredDocumentRule,
    adapter: RequiredDocumentAdapter,
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

    if (!(await userHasPermission(actorUser, adapter.verifyPermission))) {
        throw new HttpError(
            `Bạn không có quyền duyệt/từ chối ${adapter.label.toLowerCase()}`,
            403,
        );
    }
}

/**
 * Thay toan bo dong luat "giay to bat buoc/tuy chon" AP DUNG CHUNG cho ca mot
 * category (khong phai mot ban ghi cu the). Xac thuc moi documentTypeId ton
 * tai va dang active truoc khi ghi de - giong
 * businessTypeService.putDocumentRules.
 */
export async function putRequiredDocuments(
    actorId: string,
    input: PutRequiredDocumentsInput,
    adapter: RequiredDocumentAdapter,
) {
    const documentTypeIds = input.requiredDocuments.map(r => r.documentTypeId);
    if (documentTypeIds.length > 0) {
        const validCount = await DocumentType.countDocuments({
            _id: { $in: documentTypeIds },
            active: true,
        });
        if (validCount !== new Set(documentTypeIds.map(String)).size) {
            throw new HttpError(
                "Mot hoac nhieu loai giay to khong ton tai hoac da bi vo hieu hoa",
                400,
            );
        }
    }

    const previousRules = await getRequiredDocumentRules(adapter.category);

    const settings = await RequiredDocumentSettings.findOneAndUpdate(
        { category: adapter.category },
        {
            $set: {
                requiredDocuments: input.requiredDocuments,
                updatedBy: actorId,
            },
        },
        { new: true, upsert: true },
    );

    await writeAuditLog({
        actorId,
        action: `${adapter.relatedModelName.toLowerCase()}.update_required_documents`,
        targetModel: "RequiredDocumentSettings",
        targetId: settings._id,
        metadata: {
            category: adapter.category,
            before: previousRules,
            after: settings.requiredDocuments,
        },
    });

    return settings;
}

/**
 * Lay dong luat hien tai cua mot category, dung cho man cau hinh cua admin
 * (khac getRequiredDocuments: khong gan voi mot ban ghi cu the, khong gop
 * tinh trang nop/duyet).
 */
export async function getRequiredDocumentSettings(
    adapter: RequiredDocumentAdapter,
): Promise<IRequiredDocumentRule[]> {
    return getRequiredDocumentRules(adapter.category, true);
}

export type RequiredDocumentItem = {
    rule: IRequiredDocumentRule;
    activeDocument: any | null;
    history: any[];
    missing: boolean;
    expired: boolean;
};

/**
 * Tra ve ma tran yeu cau giay to (ap dung chung cho ca category) da gop voi
 * tinh trang nop/duyet hien tai CUA MOT ban ghi cu the - dung cho ca man
 * checklist cua chu ho lan man duyet cua nguoi phu trach. Quyen xem duoc kiem
 * tra qua adapter.assertScope.
 */
export async function getRequiredDocuments(
    actorUser: IUser,
    entityId: string,
    adapter: RequiredDocumentAdapter,
): Promise<{ entity: any; items: RequiredDocumentItem[] }> {
    const entity = await findEntityOrThrow(adapter, entityId);
    await adapter.assertScope(actorUser, entity);

    const rules = await getRequiredDocumentRules(adapter.category, true);

    const allDocs = await adapter.DocumentModel.find({
        [adapter.entityIdField]: entityId,
    } as any)
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName")
        .populate("reviewedBy", "displayName")
        .populate("fileAssetId", "name url mimeType sizeBytes");

    const now = Date.now();
    const items: RequiredDocumentItem[] = rules.map(rule => {
        // rule.documentTypeId da duoc populate thanh DocumentType day du o
        // tren - phai lay lai _id truoc khi so sanh, neu khong String() tren
        // ca mot document se khong khop voi DocumentModel.documentTypeId (van
        // la ObjectId tho).
        const ruleDocumentTypeId = (rule.documentTypeId as any)?._id
            ? String((rule.documentTypeId as any)._id)
            : String(rule.documentTypeId);
        const docsForType = allDocs.filter(
            (d: any) => String(d.documentTypeId) === ruleDocumentTypeId,
        );
        const activeDocument = docsForType.find((d: any) => d.active) || null;
        const history = docsForType.filter((d: any) => !d.active);
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

    return { entity, items };
}

/**
 * Chu nha/ho/cong ty (hoac admin) nop mot giay to. File phai da duoc tai len
 * truoc qua /api/uploads (relatedModel = adapter.relatedModelName, relatedId =
 * entityId) boi chinh actor nay. Ban nop cu cung (entityId, documentTypeId)
 * neu co se bi chuyen active=false (KHONG xoa) de giu lich su. KHAC
 * createBusinessDocument: KHONG dong cham den `status` cua entity sau khi nop.
 */
export async function createDocument(
    actorUser: IUser,
    entityId: string,
    input: CreateDocumentInput,
    adapter: RequiredDocumentAdapter,
) {
    const entity = await findEntityOrThrow(adapter, entityId);

    const isAdmin = actorUser.roles.includes("admin");
    const isOwner = await adapter.isOwnerActor(actorUser, entity);
    if (!isAdmin && !isOwner) {
        throw new HttpError(
            `Chỉ chủ ${adapter.label.toLowerCase()} mới được nộp giấy tờ`,
            403,
        );
    }

    const status = adapter.getStatus(entity);
    if (!isAdmin && !["unverified", "pending"].includes(status)) {
        throw new HttpError(
            `${adapter.label} không ở trạng thái cho phép nộp giấy tờ`,
            403,
        );
    }

    const rules = await getRequiredDocumentRules(adapter.category);
    const rule = rules.find(
        r => String(r.documentTypeId) === String(input.documentTypeId),
    );
    if (!rule) {
        throw new HttpError(
            "Loại giấy tờ này không nằm trong danh mục yêu cầu",
            400,
        );
    }

    const fileAsset = await FileAsset.findById(input.fileAssetId);
    if (
        !fileAsset ||
        fileAsset.relatedModel !== adapter.relatedModelName ||
        String(fileAsset.relatedId) !== String(entityId) ||
        String(fileAsset.uploadedBy) !== String(actorUser._id)
    ) {
        throw new HttpError(
            `File tải lên không hợp lệ hoặc không thuộc về ${adapter.label.toLowerCase()} này`,
            400,
        );
    }

    await adapter.DocumentModel.updateMany(
        {
            [adapter.entityIdField]: entityId,
            documentTypeId: input.documentTypeId,
            active: true,
        } as any,
        { $set: { active: false } },
    );

    const document = await adapter.DocumentModel.create({
        [adapter.entityIdField]: entityId,
        documentTypeId: input.documentTypeId,
        fileAssetId: input.fileAssetId,
        docNumber: input.docNumber,
        issueDate: input.issueDate,
        expiryDate: input.expiryDate,
        status: "pending",
        uploadedBy: actorUser._id,
        active: true,
    } as any);

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: `${adapter.relatedModelName.toLowerCase()}.upload`,
        targetModel: adapter.DocumentModel.modelName,
        targetId: (document as any)._id,
        metadata: { entityId, documentTypeId: input.documentTypeId },
    });

    return document;
}

/**
 * Nguoi phu trach (dung vai tro theo dong luat, hoac fallback
 * adapter.verifyPermission) duyet/tu choi mot giay to dang cho duyet. KHAC
 * reviewBusinessDocument: KHONG tinh lai/dong cham den `status` cua entity -
 * do la diem khac biet co chu dich voi Business.
 */
export async function reviewDocument(
    actorUser: IUser,
    entityId: string,
    documentId: string,
    decision: "approved" | "rejected",
    rejectionReason: string | undefined,
    approvalNote: string | undefined,
    adapter: RequiredDocumentAdapter,
) {
    const entity = await findEntityOrThrow(adapter, entityId);

    const document: any = await adapter.DocumentModel.findOne({
        _id: documentId,
        [adapter.entityIdField]: entityId,
        active: true,
    } as any);
    if (!document) {
        throw new HttpError("Không tìm thấy giấy tờ đang chờ duyệt", 404);
    }

    const rules = await getRequiredDocumentRules(adapter.category);
    const rule = rules.find(
        r => String(r.documentTypeId) === String(document.documentTypeId),
    );
    if (!rule) {
        throw new HttpError(
            "Loại giấy tờ này không còn nằm trong danh mục yêu cầu, không thể duyệt",
            400,
        );
    }

    if (!actorUser.roles.includes("admin")) {
        await adapter.assertScope(actorUser, entity);
    }
    await assertReviewerRoleForRule(actorUser, rule, adapter);

    document.status = decision;
    document.rejectionReason = decision === "rejected" ? rejectionReason : undefined;
    document.approvalNote = decision === "approved" ? approvalNote : undefined;
    document.reviewedBy = actorUser._id;
    document.reviewedAt = new Date();
    await document.save();

    if (decision === "rejected") {
        const notifyUserIds = await adapter.resolveNotifyUserIds(entity);
        if (notifyUserIds.length) {
            await createNotification({
                title: "Giấy tờ cần bổ sung",
                body: `Một giấy tờ của ${adapter.label.toLowerCase()} bị từ chối: ${rejectionReason}`,
                type: `${adapter.relatedModelName.toLowerCase()}.rejected`,
                targetUserIds: notifyUserIds,
                relatedModel: adapter.EntityModel.modelName,
                relatedId: (entity as any)._id,
                createdBy: actorUser._id,
            });
        }
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: `${adapter.relatedModelName.toLowerCase()}.review`,
        targetModel: adapter.DocumentModel.modelName,
        targetId: document._id,
        metadata: {
            decision,
            documentTypeId: String(document.documentTypeId),
            rejectionReason,
            approvalNote,
        },
    });

    return document;
}
