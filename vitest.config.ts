import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        setupFiles: ["tests/setup.ts"],
        testTimeout: 30000,
        hookTimeout: 120000,
        // Mot MongoMemoryServer duy nhat duoc tai su dung giua cac file test (xem tests/setup.ts),
        // nen can chay tat ca trong cung mot tien trinh, khong cach ly module giua cac file.
        pool: "forks",
        isolate: false,
        fileParallelism: false,
    },
});
