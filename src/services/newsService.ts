import { News, type INews, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type { CreateNewsInput, UpdateNewsInput } from "@/validators/news";

export async function createNews(actorUser: IUser, input: CreateNewsInput) {
    const news = await News.create({
        title: input.title,
        content: input.content,
        category: input.category,
        pinned: input.pinned,
        status: "nhap",
        createdBy: actorUser._id,
    });
    return news;
}

export async function updateNews(
    actorId: string,
    id: string,
    patch: UpdateNewsInput,
) {
    const news = await News.findById(id);
    if (!news) throw new HttpError("Khong tim thay tin tuc", 404);

    Object.assign(news, patch);
    news.updatedBy = actorId as any;
    await news.save();
    return news;
}

export async function publishNews(
    actorId: string,
    id: string,
): Promise<INews> {
    const news = await News.findById(id);
    if (!news) throw new HttpError("Khong tim thay tin tuc", 404);

    news.status = "da_dang";
    news.publishedAt = new Date();
    news.updatedBy = actorId as any;
    await news.save();

    await createNotification({
        title: "Tin tức mới",
        body: news.title,
        type: "news.published",
        targetRoles: ["house_owner"],
        relatedModel: "News",
        relatedId: news._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "news.publish",
        targetModel: "News",
        targetId: news._id,
    });

    return news;
}

export async function listNews(params: {
    page: number;
    limit: number;
    status?: string;
    category?: string;
    publicOnly?: boolean;
}) {
    const filter: Record<string, unknown> = {};
    if (params.publicOnly) {
        filter.status = "da_dang";
    } else if (params.status) {
        filter.status = params.status;
    }
    if (params.category) filter.category = params.category;

    const [items, total] = await Promise.all([
        News.find(filter)
            .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("createdBy", "displayName"),
        News.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getNewsById(id: string, publicOnly: boolean) {
    const news = await News.findById(id).populate("createdBy", "displayName");
    if (!news) throw new HttpError("Khong tim thay tin tuc", 404);
    if (publicOnly && news.status !== "da_dang") {
        throw new HttpError("Khong tim thay tin tuc", 404);
    }
    return news;
}

export async function deleteNews(actorId: string, id: string) {
    const news = await News.findById(id);
    if (!news) throw new HttpError("Khong tim thay tin tuc", 404);

    const urls = [news.coverImageUrl, ...news.images].filter(
        (url): url is string => Boolean(url),
    );
    await news.deleteOne();
    for (const url of urls) {
        // eslint-disable-next-line no-await-in-loop
        await deleteUploadedFile(url);
    }

    await writeAuditLog({
        actorId,
        action: "news.delete",
        targetModel: "News",
        targetId: id,
    });
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];

export async function uploadNewsImage(
    actorUser: IUser,
    id: string,
    file: File,
    isCover: boolean,
) {
    const news = await News.findById(id);
    if (!news) throw new HttpError("Khong tim thay tin tuc", 404);

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
        throw new HttpError(
            "File vuot qua dung luong cho phep (toi da 10MB)",
            400,
        );
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        throw new HttpError(
            `Dinh dang anh khong duoc ho tro (chi chap nhan ${ALLOWED_IMAGE_EXTENSIONS.join(", ")})`,
            400,
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(buffer, file.name, `news/${id}`);

    if (isCover) {
        const oldCover = news.coverImageUrl;
        news.coverImageUrl = url;
        await news.save();
        if (oldCover) await deleteUploadedFile(oldCover);
    } else {
        news.images.push(url);
        await news.save();
    }

    await writeAuditLog({
        actorId: actorUser._id,
        action: "news.image.upload",
        targetModel: "News",
        targetId: id,
        metadata: { url, isCover },
    });

    return news;
}

export async function removeNewsImage(
    actorUser: IUser,
    id: string,
    url: string,
) {
    const news = await News.findById(id);
    if (!news) throw new HttpError("Khong tim thay tin tuc", 404);

    if (news.coverImageUrl === url) {
        news.coverImageUrl = undefined;
    } else if (news.images.includes(url)) {
        news.images = news.images.filter(item => item !== url);
    } else {
        throw new HttpError("Khong tim thay anh trong tin tuc", 404);
    }
    await news.save();
    await deleteUploadedFile(url);

    await writeAuditLog({
        actorId: actorUser._id,
        action: "news.image.delete",
        targetModel: "News",
        targetId: id,
        metadata: { url },
    });

    return news;
}
