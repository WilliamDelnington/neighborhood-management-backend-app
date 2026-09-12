import { Survey, SurveyResponse, User, type ISurvey, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { userHasPermission } from "@/lib/rbac";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import {
    isSurveyEligible,
    resolveSurveyRecipientUserIds,
    resolveUserEligibilityContext,
    type UserEligibilityContext,
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
 * true neu user la admin, chinh nguoi tao (createdBy), hoac dong chu bien
 * (coEditorUserIds) CUA KHAO SAT NAY - day la nhom duy nhat duoc xem/sua khao
 * sat bat ke trang thai (nhap/dang_mo/da_dong) hay dieu kien doi tuong tra loi
 * (eligibleRoles/...). Quyen "surveys.read"/"surveys.update" chi la dieu kien
 * de VAO duoc man quan ly khao sat noi chung, KHONG dong nghia duoc thay/sua
 * khao sat CUA NGUOI KHAC - truoc day dung sai quyen "surveys.update"/
 * "surveys.read" toan cuc lam dieu kien nay, khien vd To truong (co
 * surveys.read) thay duoc ca khao sat nhap cua admin, hoac khao sat da gioi
 * han doi tuong tra loi khac vai tro cua ho.
 */
function isSurveyOwnerOrCoEditor(
    user: IUser | null,
    survey: ISurvey,
): boolean {
    if (!user) return false;
    if (user.roles.includes("admin")) return true;
    if (String(survey.createdBy) === String(user._id)) return true;
    return survey.coEditorUserIds.some(id => String(id) === String(user._id));
}

/**
 * Nem HttpError(403) neu actor khong duoc phep chinh sua/mo/dong/xoa khao sat
 * nay - CHI admin, chinh nguoi tao (createdBy), hoac dong chu bien
 * (coEditorUserIds) moi duoc phep. Truoc day BAT KY ai co quyen "surveys.update"
 * (vd nhieu tai khoan secretary khac nhau) deu sua duoc khao sat cua nguoi
 * khac - day la lo hong duoc bao cao va sua o day.
 */
function assertSurveyEditable(actorUser: IUser, survey: ISurvey): void {
    if (isSurveyOwnerOrCoEditor(actorUser, survey)) return;
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

/**
 * Tai khao sat va bat buoc actor la owner/co-editor (assertSurveyEditable) -
 * dung cho cac thao tac chi danh cho chu bien (sua, mo, dong, xoa, xem lich
 * su chinh sua), KHAC voi getSurveyById (cho nguoi tra loi/xem ket qua, chap
 * nhan ca nguoi ngoai du dieu kien tra loi - xem isSurveyVisibleTo).
 */
export async function requireOwnedSurvey(
    actorUser: IUser,
    id: string,
): Promise<ISurvey> {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);
    assertSurveyEditable(actorUser, survey);
    return survey;
}

export async function updateSurvey(
    actorUser: IUser,
    id: string,
    patch: UpdateSurveyInput,
) {
    const survey = await requireOwnedSurvey(actorUser, id);

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
    const survey = await requireOwnedSurvey(actorUser, id);

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
    const survey = await requireOwnedSurvey(actorUser, id);

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
    const survey = await requireOwnedSurvey(actorUser, id);
    await survey.deleteOne();
    await SurveyResponse.deleteMany({ surveyId: id });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "survey.delete",
        targetModel: "Survey",
        targetId: id,
    });
}

/**
 * true neu khao sat duoc phep thay boi viewerUser BAT KE trang thai/dieu kien
 * doi tuong: hoac ho la owner/co-editor (xem isSurveyOwnerOrCoEditor - luon
 * thay, ke ca nhap), hoac (voi khao sat KHONG phai nhap) ho du dieu kien tra
 * loi - eligibleAll, hoac isSurveyEligible khop role/vi tri cua chinh ho.
 * Dung chung cho ca listSurveys va getSurveyById de 2 cho nay LUON dong bo:
 * khao sat khong hien trong danh sach thi truy cap truc tiep bang id cung
 * khong duoc, tranh la ho ro rang qua chi tiet du list da chan.
 */
function isSurveyVisibleTo(
    survey: ISurvey,
    viewerUser: IUser | null,
    context: UserEligibilityContext | null,
): boolean {
    if (isSurveyOwnerOrCoEditor(viewerUser, survey)) return true;
    if (survey.status === "nhap") return false;
    if (survey.eligibleAll) return true;
    if (viewerUser && context) return isSurveyEligible(survey, viewerUser, context);
    return false;
}

/**
 * Quyen "surveys.read" chi la dieu kien de VAO man quan ly khao sat noi
 * chung (AdminGuard o frontend) - o day KHONG dung no de quyet dinh thay
 * "toan bo" khao sat: tung khao sat duoc xet RIENG qua isSurveyVisibleTo, nen
 * vd To truong (co surveys.read) se KHONG thay khao sat nhap cua nguoi khac,
 * cung KHONG thay khao sat da mo nhung gioi han doi tuong tra loi khac vai
 * tro/vi tri cua ho - tru khi chinh ho la nguoi tao/dong chu bien.
 */
export async function listSurveys(params: {
    page: number;
    limit: number;
    openOnly?: boolean;
    viewerUser: IUser | null;
}) {
    const dbFilter: Record<string, unknown> = {};
    if (params.openOnly) dbFilter.status = "dang_mo";

    const candidates = await Survey.find(dbFilter).sort({ createdAt: -1 });
    const context = params.viewerUser
        ? await resolveUserEligibilityContext(params.viewerUser)
        : null;

    const visible = candidates.filter(s =>
        isSurveyVisibleTo(s, params.viewerUser, context),
    );

    const total = visible.length;
    const pagedSurveys = visible.slice(
        (params.page - 1) * params.limit,
        params.page * params.limit,
    );

    // "hasResponded" de UI hien "Đã trả lời"/"Chưa trả lời" ngay trong bang
    // danh sach (xem SurveyListPage.tsx), thay vi bat nguoi dung bam vao
    // "Trả lời" moi biet minh da gui cau tra loi hay chua.
    let respondedIds = new Set<string>();
    if (params.viewerUser && pagedSurveys.length > 0) {
        const responses = await SurveyResponse.find({
            surveyId: { $in: pagedSurveys.map(s => s._id) },
            userId: params.viewerUser._id,
        }).select("surveyId");
        respondedIds = new Set(responses.map(r => String(r.surveyId)));
    }

    const items = pagedSurveys.map(s => ({
        ...s.toObject(),
        hasResponded: respondedIds.has(String(s._id)),
    }));

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getSurveyById(id: string, viewerUser: IUser | null) {
    const survey = await Survey.findById(id)
        .populate("createdBy", "displayName")
        .populate("coEditorUserIds", "displayName");
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);

    const context =
        viewerUser && !isSurveyOwnerOrCoEditor(viewerUser, survey)
            ? await resolveUserEligibilityContext(viewerUser)
            : null;
    if (!isSurveyVisibleTo(survey, viewerUser, context)) {
        throw new HttpError("Không tìm thấy khảo sát", 404);
    }

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

/**
 * So khao sat DANG MO ma actorUser du dieu kien tra loi (isSurveyEligible)
 * nhung CHUA gui cau tra loi - dung de hien so dem (badge) canh muc "Khảo
 * sát" tren menu, giup nguoi dung biet co bao nhieu khao sat dang cho ho tra
 * loi ma khong phai vao tung trang de kiem tra.
 */
export async function countUnansweredSurveys(
    actorUser: IUser,
): Promise<number> {
    const openSurveys = await Survey.find({ status: "dang_mo" });
    if (openSurveys.length === 0) return 0;

    const context = await resolveUserEligibilityContext(actorUser);
    const eligibleSurveys = openSurveys.filter(s =>
        isSurveyEligible(s, actorUser, context),
    );
    if (eligibleSurveys.length === 0) return 0;

    const answered = await SurveyResponse.find({
        surveyId: { $in: eligibleSurveys.map(s => s._id) },
        userId: actorUser._id,
    }).select("surveyId");
    const answeredIds = new Set(answered.map(r => String(r.surveyId)));

    return eligibleSurveys.filter(s => !answeredIds.has(String(s._id))).length;
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

export type SurveyIndividualResponse = {
    responseId: string;
    userId: string;
    displayName: string;
    phone?: string;
    submittedAt: Date;
    answers: {
        questionId: string;
        selectedOptions: string[];
        otherText?: string;
    }[];
};

/**
 * Danh sach cau tra loi theo TUNG nguoi (giong tab "Individual" cua Google
 * Forms) - khac voi getSurveyResults chi tra ve so lieu tong hop theo tung
 * cau hoi, o day tra ve moi SurveyResponse kem thong tin nguoi tra loi de
 * xem chi tiet ai da chon gi.
 */
export async function getSurveyIndividualResponses(
    surveyId: string,
): Promise<SurveyIndividualResponse[]> {
    const survey = await Survey.findById(surveyId);
    if (!survey) throw new HttpError("Không tìm thấy khảo sát", 404);

    const responses = await SurveyResponse.find({ surveyId })
        .populate<{ userId: IUser }>("userId", "displayName phone")
        .sort({ createdAt: 1 });

    return responses.map(response => {
        const user = response.userId as unknown as IUser;
        return {
            responseId: String(response._id),
            userId: String(user?._id ?? response.userId),
            displayName: user?.displayName ?? "Người dùng đã xóa",
            phone: user?.phone,
            submittedAt: response.createdAt,
            answers: response.answers.map(answer => ({
                questionId: String(answer.questionId),
                selectedOptions: answer.selectedOptions,
                otherText: answer.otherText,
            })),
        };
    });
}
