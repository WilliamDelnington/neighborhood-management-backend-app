import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { verifySessionToken } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import UserModel from "@/models/User";

const corsOrigin =
    process.env.NODE_ENV === "production"
        ? process.env.CORS_ORIGIN || "https://hiscustom.io.vn"
        : "*";

let io: SocketIOServer | null = null;

function userRoom(userId: string): string {
    return `user:${userId}`;
}

/**
 * Xac thuc socket bang JWT session token (giong requireUser o REST API):
 * kiem tra chu ky, tai khoan chua bi khoa, va sessionVersion con khop -
 * de token da dang xuat/doi mat khau khong con dung duoc de mo socket.
 */
async function authenticateSocket(socket: Socket): Promise<string> {
    const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.query?.token as string | undefined);
    if (!token) throw new Error("Thieu token xac thuc");

    const session = verifySessionToken(token);
    if (!session) throw new Error("Token khong hop le");

    await connectDB();
    const user = await UserModel.findById(session.userId);
    if (!user || user.status === "locked") {
        throw new Error("Tai khoan khong hop le hoac da bi khoa");
    }
    if (user.sessionVersion !== session.sv) {
        throw new Error("Phien dang nhap da het hieu luc");
    }

    return String(user._id);
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: corsOrigin,
            methods: ["GET", "POST"],
        },
    });

    io.use((socket, next) => {
        authenticateSocket(socket)
            .then(userId => {
                socket.data.userId = userId;
                next();
            })
            .catch(err => next(err instanceof Error ? err : new Error("Loi xac thuc")));
    });

    io.on("connection", socket => {
        socket.join(userRoom(socket.data.userId));
    });

    return io;
}

/**
 * Phat su kien realtime toi tat ca socket cua mot user (nhieu tab/thiet bi cung
 * join chung room). Khong throw neu io chua duoc khoi tao (vd script chay
 * doc lap ngoai server.ts) - realtime la lop bo sung, khong duoc lam gian
 * doan luong nghiep vu chinh (tao/danh dau thong bao) neu vi ly do nao do
 * thieu socket server.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
    io?.to(userRoom(String(userId))).emit(event, payload);
}

export function emitUnreadCount(userId: string, count: number): void {
    emitToUser(userId, "notification:unread-count", { count });
}
