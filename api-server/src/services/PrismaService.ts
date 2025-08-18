import { PrismaClient } from "@prisma/client";

export class PrismaService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: ["query", "info", "warn", "error"],
    });
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      console.log("📦 Prisma connected to database");
    } catch (error) {
      console.error("❌ Failed to connect to database:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    console.log("📦 Prisma disconnected from database");
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      return false;
    }
  }

  // Getter for the Prisma client
  get client(): PrismaClient {
    return this.prisma;
  }
}
