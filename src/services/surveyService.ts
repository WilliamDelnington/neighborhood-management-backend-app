import { Survey, SurveyResponse, type ISurvey } from "@/models";
import { HttpError } from "@/lib/response";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateSurveyInput,
    RespondSurveyInput,
    UpdateSurveyInput,
} from "@/validators/survey";

export async function createSurvey(actorId: string, input: CreateSurveyInput) {
    const survey = await Survey.create({
        title: input.title,
        description: input.description,
        questions: input.questions,
        eligibleRoles: input.eligibleRoles || [],
        eligibleClusters: input.eligibleClusters || [],
        eligibleAll: input.eligibleAll,
        status: "nhap",
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "survey.create",
        targetModel: "Survey",
        targetId: survey._id,
        metadata: { title: survey.title },
    });

    return survey;
}

export async function updateSurvey(
    actorId: string,
    id: string,
    patch: UpdateSurveyInput,
) {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Khong tim thay khao sat", 404);

    Object.assign(survey, patch);
    survey.updatedBy = actorId as any;
    await survey.save();

    await writeAuditLog({
        actorId,
        action: "survey.update",
        targetModel: "Survey",
        targetId: survey._id,
        metadata: { patch },
    });

    return survey;
}

export async function openSurvey(
    actorId: string,
    id: string,
): Promise<ISurvey> {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Khong tim thay khao sat", 404);

    survey.status = "dang_mo";
    if (!survey.openDate) survey.openDate = new Date();
    survey.updatedBy = actorId as any;
    await survey.save();

    await createNotification({
        title: "Khảo sát mới",
        body: survey.title,
        type: "survey.opened",
        targetRoles: survey.eligibleAll ? ["house_owner"] : survey.eligibleRoles,
        targetClusters: survey.eligibleAll ? [] : survey.eligibleClusters,
        relatedModel: "Survey",
        relatedId: survey._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "survey.open",
        targetModel: "Survey",
        targetId: survey._id,
    });

    return survey;
}

export async function closeSurvey(
    actorId: string,
    id: string,
): Promise<ISurvey> {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Khong tim thay khao sat", 404);

    survey.status = "da_dong";
    survey.closeDate = new Date();
    survey.updatedBy = actorId as any;
    await survey.save();

    await writeAuditLog({
        actorId,
        action: "survey.close",
        targetModel: "Survey",
        targetId: survey._id,
    });

    return survey;
}

export async function deleteSurvey(actorId: string, id: string) {
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Khong tim thay khao sat", 404);
    await survey.deleteOne();
    await SurveyResponse.deleteMany({ surveyId: id });

    await writeAuditLog({
        actorId,
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
    const survey = await Survey.findById(id);
    if (!survey) throw new HttpError("Khong tim thay khao sat", 404);
    return survey;
}

export async function respondToSurvey(
    userId: string,
    surveyId: string,
    input: RespondSurveyInput,
) {
    const survey = await Survey.findById(surveyId);
    if (!survey) throw new HttpError("Khong tim thay khao sat", 404);

    if (survey.status !== "dang_mo") {
        throw new HttpError("Khảo sát hiện không mở", 400);
    }

    // TODO: khi co du lieu cluster/role cua house_owner, kiem tra eligibleRoles/eligibleClusters
    // de gioi han ai duoc tra loi khao sat nay (hien tai chi kiem tra trang thai mo).

    const validQuestionIds = new Set(survey.questions.map(q => String(q._id)));
    for (const answer of input.answers) {
        if (!validQuestionIds.has(answer.questionId)) {
            throw new HttpError("Cau hoi khong thuoc khao sat nay", 422);
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
    if (!survey) throw new HttpError("Khong tim thay khao sat", 404);

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
