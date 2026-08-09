import { config as loadEnv } from "dotenv";
import { createServer } from "http";

/**
 * @/lib/socket doc process.env.JWT_SECRET (qua @/lib/auth) ngay luc import,
 * nen phai duoc import DONG (dynamic import) sau khi loadEnv() chay - cung quy
 * uoc voi cac script trong scripts/ (xem backfill-house-ownerships.ts).
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const next = (await import("next")).default;
    const { initSocketServer } = await import("@/lib/socket");

    const dev = process.env.NODE_ENV !== "production";
    const port = Number(process.env.PORT) || 4000;

    const app = next({ dev });
    const handle = app.getRequestHandler();

    await app.prepare();

    const httpServer = createServer((req, res) => handle(req, res));
    initSocketServer(httpServer);

    httpServer.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
}

main();
