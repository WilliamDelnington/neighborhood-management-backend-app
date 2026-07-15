import mongoose from "mongoose";
import dns from "dns";

type MongooseCache = {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
};

declare global {
    // eslint-disable-next-line no-var
    var _hoaBinhMongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global._hoaBinhMongooseCache || {
    conn: null,
    promise: null,
};

global._hoaBinhMongooseCache = cache;

const MONGODB_DNS_SERVERS = process.env.MONGODB_DNS_SERVERS;

if (MONGODB_DNS_SERVERS) {
    dns.setServers(
        MONGODB_DNS_SERVERS.split(",")
            .map(server => server.trim())
            .filter(Boolean),
    );
}

export async function connectDB(): Promise<typeof mongoose> {
    if (cache.conn) {
        return cache.conn;
    }

    const MONGODB_URI = process.env.MONGODB_URI as string;
    if (!MONGODB_URI) {
        throw new Error("Thieu bien moi truong MONGODB_URI");
    }

    if (!cache.promise) {
        cache.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
        });
    }

    try {
        cache.conn = await cache.promise;
        return cache.conn;
    } catch (error) {
        cache.promise = null;
        throw error;
    }
}
