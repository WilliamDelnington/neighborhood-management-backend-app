import { Survey, SurveyResponse, User, type ISurvey, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { userHasPermission } from "@/lib/rbac";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import {
    isSurveyEligible,
    resolveSurveyRecipientUserIds,
    resolveUserEligibilityContext,
} from "@/lib/surveyEligibility";
import type {
    CreateSurveyInput,
    RespondSurveyInput,
    UpdateSurveyInput,
} from "@/validators/survey";

/**
 * Nem HttpError(422) neu bat ky id nao trong danh sach khong phai tai khoan
 * dang hoat dong VA dang co quyen "surveys.update" - dieu kien de duoc them
 * lam dong chu bien tap khao sat (xem assertSurveyEditable), tuong tu cach
 * neighborhoodService validate vai tro To pho/Cong tac vien truoc khi gan.
 */
async function assertUsersCanCoEdit(userIds: string[]): Promise<void> {
    for (const userId of userIds) {
        // eslint-disable-next-line no-await-in-loop
        const user = await User.findById(userId);
        if (!user || user.status !== "active") {
            throw new HttpError(
                "Đồng chủ biên phải là tài khoản đang hoạt động",
                422,
            );
        }
        // eslint-disable-next-line no-await-in-loop
        if (!(await userHasPermission(user, "surveys.update"))) {
            throw new HttpError(
                `Tài khoản ${user.displayName} không có quyền chỉnh sửa khảo sát`,
                422,
            );
        }
    }
}

/**
 * Nem HttpError(403) neu actor khong duoc phep chinh sua/mo/dong/xoa khao sat
 * nay - CHI admin, chinh nguoi tao (createdBy), hoac dong chu bien
 * (coEditorUserIds) moi duoc phep. Truoc day BAT KY ai co quyen "surveys.update"
 * (vd nhieu tai khoan secretary khac nhau) deu sua duoc khao sat cua nguoi
 * khac - day la lo hong duoc bao cao va sua o day.
 */
function assertSurveyEditable(actorUser: IUser, survey: ISurvey): void {
    if (actorUser.roles.includes("admin")) return;
    if (String(survey.createdBy) === String(actorUser._id)) return;
    if (
        survey.coEditorUserIds.some(
            id => String(id) === String(actorUser._id),
        )
    ) {
        return;
    }
    throw new HttpError(
        "Bạn không phải người tạo hoặc đồng chủ biên của khảo sát này",
        403,
    );
}

export async function createSurvey(actorUser: IUser, input: CreateSurveyInput) {
    if (input.coEditorUserIds?.length) {
        await assertUsersCanCoEdit(input.coEditorUserIds);
    }

    const survey = await Survey.create({
        title: input.title,
        description: input.description,
        questions: input.questions,
        eligibleRoles: input.eligibleRoles || [],
        eligibleClusters: input.eligibleClusters || [],
        eligibleStreetIds: input.eligibleStreetIds || [],
        eligibleNeighborhoodIds: input.eligibleNeighborhoodIds || [],
        eligibleBusinessTypeIds: input.eligibleBusinessTypeIds || [],
        eligibleAll: input.eligibleAll,
        coEditorUserIds: input.coEditorUserIds || [],
        status: "nhap",
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "survey.create",
        targetModel: "Survey",
        targetId: survey._id,
        metadata: { title: survey.title },
    });

    return survey;
}

export async function updateSurvey(
    actorUser: IUser,
    id: string,
    patch: UpdateSurveyInput,
) {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);
    assertSurveyEditable(actorUser, survey);

    if (patch.coEditorUserIds?.length) {
        await assertUsersCanCoEdit(patch.coEditorUserIds);
    }

    Object.assign(survey, patch);
    survey.updatedBy = actorUser._id as any;
    await survey.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "survey.update",
        targetModel: "Survey",
        targetId: survey._id,
        metadata: { patch },
    });

    return survey;
}

export async function openSurvey(
    actorUser: IUser,
    id: string,
): Promise<ISurvey> {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);
    assertSurveyEditable(actorUser, survey);

    survey.status = "dang_mo";
    if (!survey.openDate) survey.openDate = new Date();
    survey.updatedBy = actorUser._id as any;
    await survey.save();

    // Goi dung danh sach user du dieu kien (tinh tu eligibleStreetIds/
    // eligibleNeighborhoodIds/eligibleBusinessTypeIds/eligibleRoles - CUNG dieu
    // kien voi isSurveyEligible dung khi nguoi dan tra loi), thay vi targetRoles/
    // targetClusters cu: targetClusters luon rong (UI tao khao sat khong con
    // dung eligibleClusters nua, chi dung eligibleNeighborhoodIds), khien
    // createNotification bo qua hoan toan pham vi vi tri va gui cho MOI user
    // co role phu hop tren toan he thong thay vi chi trong to dan pho/duong/
    // loai hinh kinh doanh duoc chon.
    const recipientUserIds = await resolveSurveyRecipientUserIds(survey);
    await createNotification({
        title: "Khảo sát mới",
        body: survey.title,
        type: "survey.opened",
        targetUserIds: recipientUserIds,
        relatedModel: "Survey",
        relatedId: survey._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "survey.open",
        targetModel: "Survey",
        targetId: survey._id,
    });

    return survey;
}

export async function closeSurvey(
    actorUser: IUser,
    id: string,
): Promise<ISurvey> {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);
    assertSurveyEditable(actorUser, survey);

    survey.status = "da_dong";
    survey.closeDate = new Date();
    survey.updatedBy = actorUser._id as any;
    await survey.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "survey.close",
        targetModel: "Survey",
        targetId: survey._id,
    });

    return survey;
}

export async function deleteSurvey(actorUser: IUser, id: string) {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);
    assertSurveyEditable(actorUser, survey);
    await survey.deleteOne();
    await SurveyResponse.deleteMany({ surveyId: id });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "survey.delete",
        targetModel: "Survey",
        targetId: id,
    });
}

export async function listSurveys(params: {
    page: number;
    limit: number;
    openOnly?: boolean;
}) {
    const filter: Record<string, unknown> = {};
    if (params.openOnly) filter.status = "dang_mo";

    const [items, total] = await Promise.all([
        Survey.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        Survey.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getSurveyById(id: string) {
    const survey = await Survey.findById(id)
        .populate("createdBy", "displayName")
        .populate("coEditorUserIds", "displayName");
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);
    return survey;
}

export async function respondToSurvey(
    actorUser: IUser,
    surveyId: string,
    input: RespondSurveyInput,
) {
    const userId = String(actorUser._id);
    const survey = await Survey.findById(surveyId);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);

    if (survey.status !== "dang_mo") {
        throw new HttpError("Khảo sát hiện không mở", 400);
    }

    const context = await resolveUserEligibilityContext(actorUser);
    if (!isSurveyEligible(survey, actorUser, context)) {
        throw new HttpError(
            "Bạn không thuộc đối tượng được trả lời khảo sát này",
            403,
        );
    }

    const validQuestionIds = new Set(survey.questions.map(q => String(q._id)));
    for (const answer of input.answers) {
        if (!validQuestionIds.has(answer.questionId)) {
            throw new HttpError("Câu hỏi không thuộc khảo sát này", 422);
        }
    }

    const existed = await SurveyResponse.exists({ surveyId, userId });
    if (existed) {
        throw new HttpError("Bạn đã trả lời khảo sát này rồi", 409);
    }

    const response = await SurveyResponse.create({
        surveyId,
        userId,
        answers: input.answers,
    });

    return response;
}

export type SurveyQuestionResult = {
    questionId: string;
    question: string;
    type: string;
    optionCounts: Record<string, number>;
    otherTexts: string[];
};

export async function getSurveyResults(surveyId: string) {
    const survey = await Survey.findById(surveyId);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);

    const responses = await SurveyResponse.find({ surveyId });

    const results: SurveyQuestionResult[] = survey.questions.map(question => {
        const questionId = String(question._id);
        const optionCounts: Record<string, number> = {};
        for (const option of question.options) {
            optionCounts[option] = 0;
        }
        const otherTexts: string[] = [];

        for (const response of responses) {
            const answer = response.answers.find(
                a => String(a.questionId) === questionId,
            );
            if (!answer) continue;

            if (question.type === "y_kien_khac") {
                if (answer.otherText) otherTexts.push(answer.otherText);
                continue;
            }

            for (const selected of answer.selectedOptions) {
                optionCounts[selected] = (optionCounts[selected] || 0) + 1;
            }
            if (answer.otherText) otherTexts.push(answer.otherText);
        }

        return {
            questionId,
            question: question.question,
            type: question.type,
            optionCounts,
            otherTexts,
        };
    });

    return {
        surveyId: String(survey._id),
        title: survey.title,
        totalResponses: responses.length,
        results,
    };
}
