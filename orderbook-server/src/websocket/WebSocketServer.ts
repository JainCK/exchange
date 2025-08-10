import WebSocket from "ws";
import { RedisService } from "../redis/RedisService";
import { OrderbookManager } from "../orderbook/OrderbookManager";
import { TradeMessage, OrderbookUpdateMessage, OrderMessage } from "../types";

export class WebSocketServer {
  private wss: WebSocket.Server;
  private redisService: RedisService;
  private orderbookManager: OrderbookManager;
  private clients: Map<WebSocket, ClientInfo>;

  constructor(
    port: number,
    redisService: RedisService,
    orderbookManager: OrderbookManager
  ) {
    this.wss = new WebSocket.Server({ port });
    this.redisService = redisService;
    this.orderbookManager = orderbookManager;
    this.clients = new Map();

    this.setupWebSocketHandlers();
    this.setupRedisSubscriptions();

    console.log(`WebSocket server running on port ${port}`);
  }

  private setupWebSocketHandlers(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log("New WebSocket connection");

      // Initialize client info
      const clientInfo: ClientInfo = {
        id: this.generateClientId(),
        subscriptions: new Set(),
        lastPing: Date.now(),
      };
      this.clients.set(ws, clientInfo);

      // Handle incoming messages
      ws.on("message", (data: string) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          this.sendError(ws, "Invalid message format");
        }
      });

      // Handle connection close
      ws.on("close", () => {
        console.log(`WebSocket connection closed: ${clientInfo.id}`);
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.clients.delete(ws);
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: "connected",
        clientId: clientInfo.id,
        timestamp: new Date().toISOString(),
        availablePairs: this.orderbookManager
          .getTradingPairs()
          .map((p) => p.symbol),
      });
    });
  }

  private handleClientMessage(ws: WebSocket, message: any): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    switch (message.type) {
      case "subscribe":
        this.handleSubscription(ws, message);
        break;

      case "unsubscribe":
        this.handleUnsubscription(ws, message);
        break;

      case "ping":
        clientInfo.lastPing = Date.now();
        this.sendMessage(ws, {
          type: "pong",
          timestamp: new Date().toISOString(),
        });
        break;

      case "getOrderbook":
        this.handleOrderbookRequest(ws, message);
        break;

      case "getMarketStats":
        this.handleMarketStatsRequest(ws, message);
        break;

      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  private handleSubscription(ws: WebSocket, message: any): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { channel } = message;
    if (!channel) {
      this.sendError(ws, "Subscription requires channel parameter");
      return;
    }

    clientInfo.subscriptions.add(channel);

    this.sendMessage(ws, {
      type: "subscribed",
      channel,
      timestamp: new Date().toISOString(),
    });

    // Send initial data for orderbook subscriptions
    if (channel.includes(":orderbook")) {
      const tradingPair = channel.split(":")[1];
      const snapshot = this.orderbookManager.getOrderbookSnapshot(tradingPair);
      if (snapshot) {
        this.sendMessage(ws, {
          type: "orderbook",
          tradingPair,
          data: snapshot,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private handleUnsubscription(ws: WebSocket, message: any): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { channel } = message;
    if (channel) {
      clientInfo.subscriptions.delete(channel);
      this.sendMessage(ws, {
        type: "unsubscribed",
        channel,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleOrderbookRequest(ws: WebSocket, message: any): void {
    const { tradingPair, depth = 20 } = message;

    if (!tradingPair) {
      this.sendError(ws, "Trading pair is required");
      return;
    }

    const snapshot = this.orderbookManager.getOrderbookSnapshot(
      tradingPair,
      depth
    );
    if (snapshot) {
      this.sendMessage(ws, {
        type: "orderbook",
        tradingPair,
        data: snapshot,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.sendError(ws, `Trading pair ${tradingPair} not found`);
    }
  }

  private handleMarketStatsRequest(ws: WebSocket, message: any): void {
    const { tradingPair } = message;

    if (tradingPair) {
      const stats = this.orderbookManager.getMarketStats(tradingPair);
      this.sendMessage(ws, {
        type: "marketStats",
        tradingPair,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } else {
      const allStats = this.orderbookManager.getAllMarketStats();
      this.sendMessage(ws, {
        type: "marketStats",
        data: allStats,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private setupRedisSubscriptions(): void {
    // Subscribe to all trading pairs for orderbook updates
    this.orderbookManager.getTradingPairs().forEach((pair) => {
      this.redisService.subscribeToOrderbook(pair.symbol, (update) => {
        this.broadcastToSubscribers(`market:${pair.symbol}:orderbook`, {
          type: "orderbook",
          tradingPair: pair.symbol,
          data: update.snapshot,
          timestamp: update.timestamp.toISOString(),
        });
      });

      this.redisService.subscribeToTrades(pair.symbol, (trade) => {
        this.broadcastToSubscribers(`market:${pair.symbol}:trades`, {
          type: "trade",
          tradingPair: pair.symbol,
          data: trade.trade,
          timestamp: trade.timestamp.toISOString(),
        });
      });
    });
  }

  private broadcastToSubscribers(channel: string, message: any): void {
    this.clients.forEach((clientInfo, ws) => {
      if (
        clientInfo.subscriptions.has(channel) &&
        ws.readyState === WebSocket.OPEN
      ) {
        this.sendMessage(ws, message);
      }
    });
  }

  private sendMessage(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: "error",
      message: error,
      timestamp: new Date().toISOString(),
    });
  }

  private generateClientId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  // Start ping/pong heartbeat
  startHeartbeat(): void {
    setInterval(() => {
      const now = Date.now();
      this.clients.forEach((clientInfo, ws) => {
        if (now - clientInfo.lastPing > 60000) {
          // 1 minute timeout
          console.log(`Closing stale connection: ${clientInfo.id}`);
          ws.terminate();
          this.clients.delete(ws);
        }
      });
    }, 30000); // Check every 30 seconds
  }

  // Get connection stats
  getStats(): { totalConnections: number; totalSubscriptions: number } {
    let totalSubscriptions = 0;
    this.clients.forEach((clientInfo) => {
      totalSubscriptions += clientInfo.subscriptions.size;
    });

    return {
      totalConnections: this.clients.size,
      totalSubscriptions,
    };
  }
}

interface ClientInfo {
  id: string;
  subscriptions: Set<string>;
  lastPing: number;
}
