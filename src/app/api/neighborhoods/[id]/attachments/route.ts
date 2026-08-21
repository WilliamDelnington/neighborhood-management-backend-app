import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { FileAsset, NeighborhoodHistory } from "@/models";
import { createFileAsset } from "@/services/fileAssetService";
import { getNeighborhoodById } from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

const attachmentSchema = z.object({
    name: z.string().trim().min(1),
    url: z.string().url(),
    description: z.string().trim().optional(),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.read");
        await getNeighborhoodById(params.id, user);
        const items = await FileAsset.find({
            relatedModel: "Neighborhood",
            relatedId: params.id,
        })
            .sort({ createdAt: -1 })
            .populate("uploadedBy", "displayName");
        return apiSuccess(items);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const body = attachmentSchema.parse(await req.json());
        const attachment = await createFileAsset(String(user._id), {
            ...body,
            category: "attachment",
            relatedModel: "Neighborhood",
            relatedId: params.id,
            isPublic: false,
            targetRoles: [],
            audienceAll: false,
        });
        await NeighborhoodHistory.create({
            neighborhoodId: params.id,
            actorId: user._id,
            action: "ATTACHMENT_ADDED",
            metadata: { fileId: attachment._id, name: attachment.name },
        });
        return apiSuccess(attachment, "Thêm tài liệu đính kèm thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
