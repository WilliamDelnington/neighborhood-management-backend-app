import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = "enc:v1:";

const ENCRYPTION_KEY_B64 = process.env.ENCRYPTION_KEY as string;

if (!ENCRYPTION_KEY_B64) {
    throw new Error("Thieu bien moi truong ENCRYPTION_KEY");
}

const KEY = Buffer.from(ENCRYPTION_KEY_B64, "base64");

if (KEY.length !== 32) {
    throw new Error(
        "ENCRYPTION_KEY phai la chuoi base64 ma hoa 32 byte (vd: openssl rand -base64 32)",
    );
}

// Khoa rieng cho HMAC lookup-hash, dan xuat tu ENCRYPTION_KEY - tranh dung
// chung mot khoa cho ca ma hoa (confidentiality) lan bam tra cuu (integrity).
const HMAC_KEY = crypto
    .createHash("sha256")
    .update(Buffer.concat([KEY, Buffer.from("lookup-hash")]))
    .digest();

/**
 * Ma hoa mot chuoi nhay cam (sdt, cccd) bang AES-256-GCM. Ket qua la mot
 * chuoi base64 duy nhat (iv + authTag + ciphertext) kem tien to "enc:v1:" de
 * phan biet voi du lieu chua ma hoa (xem decryptSensitive/isEncryptedSensitive).
 */
export function encryptSensitive(plain: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return (
        ENCRYPTED_PREFIX +
        Buffer.concat([iv, authTag, ciphertext]).toString("base64")
    );
}

export function isEncryptedSensitive(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Giai ma gia tri tao boi encryptSensitive. Gia tri chua co tien to "enc:v1:"
 * (du lieu cu, chua chay backfill - xem scripts/backfill-encrypt-citizens.ts)
 * duoc tra ve nguyen trang thay vi nem loi, de he thong van hoat dong binh
 * thuong trong khoang thoi gian giua luc trien khai va luc chay backfill.
 */
export function decryptSensitive(value: string): string {
    if (!isEncryptedSensitive(value)) return value;

    const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]).toString("utf8");
}

/** Bam HMAC-SHA256 mot gia tri da chuan hoa, dung cho tim kiem exact-match tren truong da ma hoa. */
export function hashForLookup(normalizedValue: string): string {
    return crypto
        .createHmac("sha256", HMAC_KEY)
        .update(normalizedValue)
        .digest("hex");
}

export function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, "");
}

export function normalizeCccd(cccd: string): string {
    return cccd.replace(/\s+/g, "").toUpperCase();
}

/** Che sdt, chi giu lai 3 so cuoi, vd "0912345678" -> "*******678". */
export function maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length <= 3) return "*".repeat(digits.length);
    return "*".repeat(digits.length - 3) + digits.slice(-3);
}

/** Che CCCD, chi giu lai 4 so cuoi, vd "012345678910" -> "********8910". */
export function maskCccd(cccd: string): string {
    if (cccd.length <= 4) return "*".repeat(cccd.length);
    return "*".repeat(cccd.length - 4) + cccd.slice(-4);
}
