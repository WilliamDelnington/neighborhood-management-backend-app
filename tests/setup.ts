import { beforeAll, afterEach, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// Phai gan truoc khi bat ky module nao (vd @/lib/auth) duoc import, vi cac module do
// doc bien moi truong ngay o top-level va nem loi neu thieu.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-vitest";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
process.env.ZALO_ENV = "sandbox";
process.env.ZALO_OA_SECRET_KEY =
    process.env.ZALO_OA_SECRET_KEY || "test-oa-secret-key";
process.env.CORS_ORIGIN = "*";
process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString("base64");

declare global {
    // eslint-disable-next-line no-var
    var __mongoMemoryServer: MongoMemoryServer | undefined;
}

beforeAll(async () => {
    // pool: forks + singleFork chay tat ca cac file test trong cung mot tien trinh,
    // nen chi khoi tao 1 instance MongoMemoryServer duy nhat va tai su dung.
    if (!global.__mongoMemoryServer) {
        global.__mongoMemoryServer = await MongoMemoryServer.create();
    }
    process.env.MONGODB_URI = global.__mongoMemoryServer.getUri();

    const { connectDB } = await import("@/lib/mongodb");
    await connectDB();
}, 120000);

afterEach(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await Promise.all(
        Object.values(mongoose.connection.collections).map(collection =>
            collection.deleteMany({}),
        ),
    );
});

afterAll(async () => {
    // Giu nguyen ket noi mo cho cac file test khac trong cung tien trinh (singleFork).
});
