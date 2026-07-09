import { Meeting, MeetingRegistration, type IMeeting } from "@/models";
import { HttpError } from "@/lib/response";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateMeetingInput,
    RegisterMeetingInput,
    UpdateMeetingInput,
} from "@/validators/meeting";

export const STAFF_ROLES_FOR_MEETINGS = [
    "neighborhood_leader",
    "secretary",
    "admin",
] as const;

async function notifyMeetingPublished(actorId: string, meeting: IMeeting) {
    // Chua co co che phan cum/vai tro rieng cho cuoc hop nen thong bao rong toi
    // toan bo cu dan (resident); co the thu hep theo targetClusters khi co nhu cau.
    await createNotification({
        title: "Cuộc họp mới",
        body: `${meeting.title} - ${meeting.location}`,
        type: "meeting.published",
        targetRoles: ["resident"],
        relatedModel: "Meeting",
        relatedId: meeting._id,
        createdBy: actorId,
    });
}

export async function createMeeting(
    actorId: string,
    input: CreateMeetingInput,
) {
    const meeting = await Meeting.create({
        title: input.title,
        startTime: new Date(input.startTime),
        location: input.location,
        content: input.content,
        minutes: input.minutes,
        attachments: input.attachments || [],
        published: input.published,
        createdBy: actorId,
    });

    if (meeting.published) {
        await notifyMeetingPublished(actorId, meeting);
    }

    return meeting;
}

export async function updateMeeting(
    actorId: string,
    id: string,
    patch: UpdateMeetingInput,
) {
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);

    const wasPublished = meeting.published;
    const { startTime, ...rest } = patch;
    Object.assign(meeting, rest);
    if (startTime) meeting.startTime = new Date(startTime);
    meeting.updatedBy = actorId as any;
    await meeting.save();

    if (!wasPublished && meeting.published) {
        await notifyMeetingPublished(actorId, meeting);
    }

    return meeting;
}

export async function listMeetings(params: {
    page: number;
    limit: number;
    upcomingOnly?: boolean;
}) {
    const filter: Record<string, unknown> = {};
    if (params.upcomingOnly) filter.startTime = { $gte: new Date() };

    const [items, total] = await Promise.all([
        Meeting.find(filter)
            .sort({ startTime: params.upcomingOnly ? 1 : -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        Meeting.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getMeetingById(id: string) {
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);
    return meeting;
}

export async function deleteMeeting(actorId: string, id: string) {
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);
    await meeting.deleteOne();
    await MeetingRegistration.deleteMany({ meetingId: id });

    await writeAuditLog({
        actorId,
        action: "meeting.delete",
        targetModel: "Meeting",
        targetId: id,
    });
}

export async function registerForMeeting(
    userId: string,
    meetingId: string,
    input: RegisterMeetingInput,
) {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);

    const registration = await MeetingRegistration.findOneAndUpdate(
        { meetingId, userId },
        {
            $set: {
                answer: input.answer,
                delegateName:
                    input.answer === "uy_quyen"
                        ? input.delegateName
                        : undefined,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return registration;
}

export async function listMyRegistration(userId: string, meetingId: string) {
    return MeetingRegistration.findOne({ meetingId, userId });
}

export async function listRegistrationsForMeeting(
    meetingId: string,
    { page, limit }: { page: number; limit: number },
) {
    const filter = { meetingId };
    const [items, total] = await Promise.all([
        MeetingRegistration.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("userId", "displayName phone"),
        MeetingRegistration.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
