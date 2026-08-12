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
    const hostname = process.env.HOST || "localhost";
    const port = Number(process.env.PORT) || 4000;

    // Next.js falls back to hostname "localhost" / port 3000 for ANYTHING built
    // on top of req.url (eg. NextRequest.url in route handlers) if these are
    // omitted here - regardless of the port the server actually binds to below.
    // Passing them explicitly keeps req.url-derived origins correct for local
    // dev (see lib/localUpload.ts getPublicOrigin, which needs a real fallback
    // when PUBLIC_API_ORIGIN isn't configured, ie. no reverse proxy in front).
    const app = next({ dev, hostname, port });
    const handle = app.getRequestHandler();

    await app.prepare();

    const httpServer = createServer((req, res) => handle(req, res));
    initSocketServer(httpServer);

    httpServer.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
}

main();
