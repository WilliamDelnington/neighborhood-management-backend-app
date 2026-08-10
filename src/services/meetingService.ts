import { FileAsset, Meeting, MeetingRegistration, type IMeeting, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateMeetingInput,
    RegisterMeetingInput,
    UpdateMeetingInput,
} from "@/validators/meeting";

async function notifyMeetingPublished(actorId: string, meeting: IMeeting) {
    await createNotification({
        title: "Cuộc họp mới",
        body: `${meeting.title} - ${meeting.location}`,
        type: "meeting.published",
        targetRoles: meeting.eligibleAll ? ["house_owner"] : meeting.eligibleRoles,
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
        published: input.published,
        eligibleRoles: input.eligibleRoles || [],
        eligibleStreetIds: input.eligibleStreetIds || [],
        eligibleNeighborhoodIds: input.eligibleNeighborhoodIds || [],
        eligibleBusinessTypeIds: input.eligibleBusinessTypeIds || [],
        eligibleAll: input.eligibleAll,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "meeting.create",
        targetModel: "Meeting",
        targetId: meeting._id,
        metadata: { title: meeting.title },
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

    await writeAuditLog({
        actorId,
        action: "meeting.update",
        targetModel: "Meeting",
        targetId: meeting._id,
        metadata: { patch },
    });

    if (!wasPublished && meeting.published) {
        await notifyMeetingPublished(actorId, meeting);
    }

    return meeting;
}

export async function listMeetings(params: {
    page: number;
    limit: number;
    upcomingOnly?: boolean;
    publicOnly?: boolean;
}) {
    const filter: Record<string, unknown> = {};
    if (params.upcomingOnly) filter.startTime = { $gte: new Date() };
    if (params.publicOnly) filter.published = true;

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

export async function getMeetingById(id: string, publicOnly: boolean) {
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);
    if (publicOnly && !meeting.published) {
        throw new HttpError("Khong tim thay cuoc hop", 404);
    }
    return meeting;
}

export async function deleteMeeting(actorId: string, id: string) {
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);
    await meeting.deleteOne();
    await MeetingRegistration.deleteMany({ meetingId: id });

    const attachments = await FileAsset.find({
        relatedModel: "Meeting",
        relatedId: id,
    });
    for (const attachment of attachments) {
        // eslint-disable-next-line no-await-in-loop
        await deleteUploadedFile(attachment.url);
    }
    await FileAsset.deleteMany({ relatedModel: "Meeting", relatedId: id });

    await writeAuditLog({
        actorId,
        action: "meeting.delete",
        targetModel: "Meeting",
        targetId: id,
    });
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf",
    ".doc",
    ".docx",
];

export async function listMeetingAttachments(meetingId: string) {
    return FileAsset.find({
        relatedModel: "Meeting",
        relatedId: meetingId,
    })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

export async function uploadMeetingAttachment(
    actorUser: IUser,
    meetingId: string,
    file: File,
) {
    const meeting = await Meeting.findById(meetingId).select("_id");
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new HttpError(
            "File vuot qua dung luong cho phep (toi da 10MB)",
            400,
        );
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        throw new HttpError(
            `Dinh dang file khong duoc ho tro (chi chap nhan ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")})`,
            400,
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(
        buffer,
        file.name,
        `meeting/${meetingId}`,
    );

    const fileAsset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "Meeting",
        relatedId: meetingId,
        isPublic: true,
        audienceAll: true,
        targetRoles: [],
        uploadedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "meeting.attachment.upload",
        targetModel: "Meeting",
        targetId: meetingId,
        metadata: { fileAssetId: fileAsset._id, name: file.name },
    });

    return fileAsset;
}

export async function deleteMeetingAttachment(
    actorUser: IUser,
    meetingId: string,
    fileAssetId: string,
) {
    const fileAsset = await FileAsset.findOne({
        _id: fileAssetId,
        relatedModel: "Meeting",
        relatedId: meetingId,
    });
    if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);

    await deleteUploadedFile(fileAsset.url);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "meeting.attachment.delete",
        targetModel: "Meeting",
        targetId: meetingId,
        metadata: { fileAssetId, name: fileAsset.name },
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
