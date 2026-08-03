import mongoose, { Schema, type Document, type Model } from "mongoose";

export const OTP_PURPOSES = ["register", "login"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export interface IOtpChallenge extends Document {
    // Bam HMAC (hashForLookup) cua so dien thoai da chuan hoa - khong luu so
    // dien thoai goc, giong quy uoc Citizen.phoneHash (xem lib/encryption.ts).
    phoneHash: string;
    // Bam bcrypt cua ma OTP 6 so - mot chieu, chi de so sanh khi verify, khong
    // bao gio can giai ma lai (khac voi encryptSensitive/decryptSensitive).
    codeHash: string;
    purpose: OtpPurpose;
    attempts: number;
    maxAttempts: number;
    expiresAt: Date;
    consumedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const OtpChallengeSchema = new Schema<IOtpChallenge>(
    {
        phoneHash: { type: String, required: true, index: true },
        codeHash: { type: String, required: true },
        purpose: { type: String, enum: OTP_PURPOSES, required: true },
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 5 },
        expiresAt: { type: Date, required: true },
        consumedAt: { type: Date },
    },
    { timestamps: true },
);

// TTL: Mongo tu xoa ban ghi sau khi expiresAt qua han - don gian hon mot cron
// job rieng (xem lib/scheduler.ts) cho viec don dep thuan tuy nay.
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.OtpChallenge as Model<IOtpChallenge>) ||
    mongoose.model<IOtpChallenge>("OtpChallenge", OtpChallengeSchema);
