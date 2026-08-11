import mongoose, { Schema, type Document, type Model } from "mongoose";

// Trao doi theo tung ho so nghiep vu (B14) - CHI ho tro entityType="Request"
// trong lan nay (theo yeu cau cu the), khong phai mot khung "the loai chat"
// chung cho moi entity. Mo rong sang Complaint/Report... sau nay chi can them
// gia tri vao COMMENT_ENTITY_TYPES + kiem tra quyen xem tuong ung o service.
export const COMMENT_ENTITY_TYPES = ["Request"] as const;
export type CommentEntityType = typeof COMMENT_ENTITY_TYPES[number];

export interface IComment extends Document {
    entityType: CommentEntityType;
    entityId: mongoose.Types.ObjectId;
    authorId: mongoose.Types.ObjectId;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
    {
        entityType: {
            type: String,
            enum: COMMENT_ENTITY_TYPES,
            required: true,
        },
        entityId: { type: Schema.Types.ObjectId, required: true, index: true },
        authorId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: { type: String, required: true, trim: true },
    },
    { timestamps: true },
);

CommentSchema.index({ entityType: 1, entityId: 1, createdAt: 1 });

export default (mongoose.models.Comment as Model<IComment>) ||
    mongoose.model<IComment>("Comment", CommentSchema);
