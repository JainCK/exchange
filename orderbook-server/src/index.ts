import express from "express";
import { OrderInputSchema, LimitOrderSchema, MarketOrderSchema } from "./types";
import { OrderbookManager } from "./orderbook/OrderbookManager";
import { RedisService } from "./redis/RedisService";
import { WebSocketServer } from "./websocket/WebSocketServer";

const app = express();
app.use(express.json());

// Configuration
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

// Global services
let orderbookManager: OrderbookManager;
let redisService: RedisService;
let wsServer: WebSocketServer;

// Initialize services
async function initializeServices() {
  try {
    console.log("Initializing services...");

    // Initialize Redis
    redisService = new RedisService(REDIS_URL);
    await redisService.connect();

    // Initialize Orderbook Manager with enhanced features
    orderbookManager = new OrderbookManager(redisService);

    // Initialize WebSocket Server
    wsServer = new WebSocketServer(
      parseInt(WS_PORT.toString()),
      redisService,
      orderbookManager
    );
    wsServer.startHeartbeat();

    console.log("All services initialized successfully");
  } catch (error) {
    console.error("Failed to initialize services:", error);
    process.exit(1);
  }
}

// Health check endpoint
app.get("/health", async (req, res) => {
  const redisHealth = await redisService.ping();
  const wsStats = wsServer.getStats();

  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      redis: redisHealth ? "connected" : "disconnected",
      websocket: {
        connections: wsStats.totalConnections,
        subscriptions: wsStats.totalSubscriptions,
      },
      orderbooks: orderbookManager.getTradingPairs().length,
    },
  });
});

// Get trading pairs
app.get("/api/v1/pairs", (req, res) => {
  const pairs = orderbookManager.getTradingPairs();
  res.json(pairs);
});

// Get orderbook for a trading pair
app.get("/api/v1/orderbook/:symbol", (req, res) => {
  const { symbol } = req.params;
  const depth = parseInt(req.query.depth as string) || 20;

  const snapshot = orderbookManager.getOrderbookSnapshot(symbol, depth);
  if (!snapshot) {
    res.status(404).json({ error: "Trading pair not found" });
    return;
  }

  res.json(snapshot);
});

// Get market stats for all pairs
app.get("/api/v1/stats", (req, res) => {
  const allStats = orderbookManager.getAllMarketStats();
  res.json(allStats);
});

// Get enhanced market stats (must come before :symbol route)
// TODO: Enhanced stats endpoint may have route conflicts - revisit if needed for frontend dashboard
// Use case: Comprehensive market overview with spreads, fees, trading pair details, and advanced analytics
// Priority: Low - basic /api/v1/stats/:symbol endpoint covers most frontend needs
app.get("/api/v1/stats/enhanced", (req, res) => {
  try {
    if (!orderbookManager) {
      res.status(503).json({ error: "Service not initialized yet" });
      return;
    }

    const stats = orderbookManager.getEnhancedMarketStats();
    console.log("Enhanced stats generated:", Object.keys(stats));
    res.json(stats);
  } catch (error) {
    console.error("Error getting enhanced stats:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get market stats for specific pair
app.get("/api/v1/stats/:symbol", (req, res) => {
  const { symbol } = req.params;
  const stats = orderbookManager.getMarketStats(symbol);
  if (!stats) {
    res.status(404).json({ error: "Trading pair not found" });
    return;
  }
  res.json({ symbol, ...stats });
});

// Submit a new order
app.post("/api/v1/order", async (req, res) => {
  try {
    // Validate input
    const orderValidation = OrderInputSchema.safeParse(req.body);
    if (!orderValidation.success) {
      res.status(400).json({
        error: "Invalid order data",
        details: orderValidation.error.issues,
      });
      return;
    }

    const orderData = orderValidation.data;

    // Validate order type specific requirements
    if (orderData.orderType === "limit") {
      const limitValidation = LimitOrderSchema.safeParse(orderData);
      if (!limitValidation.success) {
        res.status(400).json({
          error: "Invalid limit order",
          details: limitValidation.error.issues,
        });
        return;
      }
    } else if (orderData.orderType === "market") {
      const marketValidation = MarketOrderSchema.safeParse(orderData);
      if (!marketValidation.success) {
        res.status(400).json({
          error: "Invalid market order",
          details: marketValidation.error.issues,
        });
        return;
      }
    }

    // Process the order
    const result = await orderbookManager.processOrder({
      tradingPair: orderData.tradingPair,
      side: orderData.side,
      orderType: orderData.orderType,
      price: orderData.price,
      quantity: orderData.quantity,
      timeInForce: orderData.timeInForce,
      userId: orderData.userId || `user_${Date.now()}`,
    });

    res.json(result);
  } catch (error) {
    console.error("Error processing order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cancel an order
app.delete("/api/v1/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { tradingPair } = req.body;

    if (!tradingPair) {
      res.status(400).json({ error: "Trading pair is required" });
      return;
    }

    const cancelled = await orderbookManager.cancelOrder(orderId, tradingPair);

    if (cancelled) {
      res.json({ success: true, message: "Order cancelled" });
    } else {
      res.status(404).json({ error: "Order not found" });
    }
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get recent trades
app.get("/api/v1/trades/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const trades = await redisService.getRecentTrades(symbol, limit);
    res.json(trades);
  } catch (error) {
    console.error("Error getting recent trades:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Enhanced API endpoints for new features

// Get user position
app.get("/api/v1/position/:userId/:symbol", (req, res) => {
  try {
    const { userId, symbol } = req.params;
    const position = orderbookManager.getUserPosition(userId, symbol);
    res.json(position);
  } catch (error) {
    console.error("Error getting user position:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get trade statistics
app.get("/api/v1/trades/stats/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe } = req.query;

    const stats = await orderbookManager.getTradeStats(
      symbol,
      (timeframe as "1h" | "24h" | "7d") || "24h"
    );

    res.json(stats);
  } catch (error) {
    console.error("Error getting trade stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get trading fee information
app.get("/api/v1/fees", (req, res) => {
  try {
    const feeRate = orderbookManager.getTradingFee();
    res.json({
      feeRate,
      feePercentage: (feeRate * 100).toFixed(3) + "%",
      description: "Trading fee applied to all executed trades",
    });
  } catch (error) {
    console.error("Error getting fee info:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin endpoint to set trading fees (in production, this should be protected)
app.post("/api/v1/admin/fees", (req, res) => {
  try {
    const { feeRate } = req.body;

    if (typeof feeRate !== "number" || feeRate < 0 || feeRate > 0.01) {
      res
        .status(400)
        .json({ error: "Fee rate must be between 0 and 0.01 (1%)" });
      return;
    }

    orderbookManager.setTradingFee(feeRate);
    res.json({
      success: true,
      newFeeRate: feeRate,
      message: "Trading fee updated successfully",
    });
  } catch (error) {
    console.error("Error setting trading fee:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin endpoint to reset daily limits
app.post("/api/v1/admin/reset-limits", (req, res) => {
  try {
    orderbookManager.resetDailyLimits();
    res.json({ success: true, message: "Daily limits reset successfully" });
  } catch (error) {
    console.error("Error resetting daily limits:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(HTTP_PORT, () => {
  console.log(`🚀 Enhanced Orderbook Server running on port ${HTTP_PORT}`);
  console.log(`📊 WebSocket server running on port ${WS_PORT}`);
  console.log(`💾 Redis connection: ${REDIS_URL}`);

  // Initialize services after server starts
  initializeServices().then(() => {
    // Add sample liquidity
    orderbookManager.initializeSampleLiquidity();
    console.log("✅ Server fully initialized with enhanced features:");
    console.log("   - Price-time priority matching");
    console.log("   - Risk management checks");
    console.log("   - Position management");
    console.log("   - Real-time trade execution");
    console.log("   - Enhanced API endpoints");
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  await redisService.disconnect();
  process.exit(0);
});

export { app, orderbookManager, redisService };
