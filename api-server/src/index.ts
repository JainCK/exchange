import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

// Import routes
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import balanceRoutes from "./routes/balance";
import orderRoutes from "./routes/order";

// Import middleware
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";

// Import services
import { PrismaService } from "./services/PrismaService";
import { RedisService } from "./services/RedisService";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize services
let prismaService: PrismaService;
let redisService: RedisService;

async function initializeServices() {
  try {
    console.log("🔧 Initializing services...");

    // Initialize Prisma
    prismaService = new PrismaService();
    await prismaService.connect();

    // Initialize Redis
    redisService = new RedisService(process.env.REDIS_URL);
    await redisService.connect();

    console.log("✅ All services initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize services:", error);
    process.exit(1);
  }
}

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"), // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const redisHealth = (await redisService?.ping()) || false;
    const dbHealth = (await prismaService?.healthCheck()) || false;

    const status = redisHealth && dbHealth ? "healthy" : "unhealthy";
    const statusCode = status === "healthy" ? 200 : 503;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth ? "connected" : "disconnected",
        redis: redisHealth ? "connected" : "disconnected",
      },
      version: process.env.npm_package_version || "1.0.0",
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Health check failed",
    });
  }
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/balance", balanceRoutes);
app.use("/api/v1/order", orderRoutes);

// API info endpoint
app.get("/api/v1", (req, res) => {
  res.json({
    name: "Exchange API Server",
    version: "1.0.0",
    description: "Authentication and User Management API for Trading Exchange",
    endpoints: {
      auth: "/api/v1/auth",
      user: "/api/v1/user",
      balance: "/api/v1/balance",
      order: "/api/v1/order",
    },
    documentation: "/api/v1/docs",
    health: "/health",
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    await initializeServices();

    app.listen(PORT, () => {
      console.log(`🚀 API Server running on port ${PORT}`);
      console.log(`🌐 CORS enabled for: ${process.env.CORS_ORIGIN}`);
      console.log(
        `🔒 Rate limiting: ${process.env.RATE_LIMIT_MAX_REQUESTS} requests per ${process.env.RATE_LIMIT_WINDOW_MS}ms`
      );
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1`);
      console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🔄 Shutting down gracefully...");

  if (redisService) {
    await redisService.disconnect();
  }

  if (prismaService) {
    await prismaService.disconnect();
  }

  console.log("👋 Server shutdown complete");
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🔄 Received SIGINT, shutting down gracefully...");

  if (redisService) {
    await redisService.disconnect();
  }

  if (prismaService) {
    await prismaService.disconnect();
  }

  console.log("👋 Server shutdown complete");
  process.exit(0);
});

// Start the server
startServer();

export { app, prismaService, redisService };
