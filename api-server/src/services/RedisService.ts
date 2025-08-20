import { createClient, RedisClientType } from "redis";

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor(redisUrl?: string) {
    this.client = createClient({
      url: redisUrl || "redis://localhost:6379",
    });

    this.setupErrorHandlers();
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
      console.log("🔴 Redis connected");
    } catch (error) {
      console.error("❌ Failed to connect to Redis:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this.isConnected = false;
    console.log("🔴 Redis disconnected");
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      return false;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;

    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number
  ): Promise<void> {
    if (!this.isConnected) return;
    await this.client.setEx(key, ttlSeconds, value);
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    return await this.client.get(key);
  }

  async del(key: string): Promise<number> {
    if (!this.isConnected) return 0;
    return await this.client.del(key);
  }

  async delete(key: string): Promise<number> {
    return await this.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) return false;
    const result = await this.client.exists(key);
    return result === 1;
  }

  // Session management
  async setSession(
    sessionId: string,
    userId: string,
    ttlSeconds: number = 86400
  ): Promise<void> {
    await this.set(`session:${sessionId}`, userId, ttlSeconds);
  }

  async getSession(sessionId: string): Promise<string | null> {
    return await this.get(`session:${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  // Rate limiting
  async incrementRateLimit(key: string, windowMs: number): Promise<number> {
    if (!this.isConnected) return 0;

    const current = await this.client.incr(key);
    if (current === 1) {
      await this.client.expire(key, Math.ceil(windowMs / 1000));
    }
    return current;
  }

  private setupErrorHandlers(): void {
    this.client.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    this.client.on("connect", () => {
      console.log("Redis Client Connected");
    });

    this.client.on("ready", () => {
      console.log("Redis Client Ready");
    });

    this.client.on("end", () => {
      console.log("Redis Client Disconnected");
    });
  }
}
