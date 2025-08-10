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
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Services
let redisService: RedisService;
let orderbookManager: OrderbookManager;
let wsServer: WebSocketServer;

// Initialize services
async function initializeServices() {
  try {
    console.log("Initializing trading exchange services...");

    // Initialize Redis
    redisService = new RedisService(REDIS_URL);
    await redisService.connect();

    // Initialize Orderbook Manager
    orderbookManager = new OrderbookManager(redisService);

    // Initialize sample liquidity for demo
    await orderbookManager.initializeSampleLiquidity();

    // Initialize WebSocket server
    wsServer = new WebSocketServer(
      Number(WS_PORT),
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

    // Additional validation based on order type
    if (orderData.orderType === "limit") {
      const limitValidation = LimitOrderSchema.safeParse(req.body);
      if (!limitValidation.success) {
        res.status(400).json({
          error: "Limit orders require a price",
          details: limitValidation.error.issues,
        });
        return;
      }
    }

    // Check if trading pair exists
    const tradingPair = orderbookManager.getTradingPair(orderData.tradingPair);
    if (!tradingPair) {
      res.status(400).json({ error: "Invalid trading pair" });
      return;
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
    console.error("Error fetching trades:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the HTTP server
app.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on port ${HTTP_PORT}`);
  console.log(`WebSocket server running on port ${WS_PORT}`);
  console.log("\nAPI Endpoints:");
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /api/v1/pairs - Get trading pairs`);
  console.log(`  GET  /api/v1/orderbook/:symbol - Get orderbook`);
  console.log(`  GET  /api/v1/stats/:symbol? - Get market stats`);
  console.log(`  POST /api/v1/order - Submit order`);
  console.log(`  DELETE /api/v1/order/:orderId - Cancel order`);
  console.log(`  GET  /api/v1/trades/:symbol - Get recent trades`);
  console.log(`\nWebSocket URL: ws://localhost:${WS_PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");

  if (redisService) {
    await redisService.disconnect();
  }

  process.exit(0);
});

// Initialize services on startup
initializeServices();

// Export for testing
export { app, orderbookManager, redisService };
