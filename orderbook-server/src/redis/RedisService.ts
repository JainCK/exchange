import { createClient, RedisClientType } from "redis";
import {
  OrderMessage,
  TradeMessage,
  OrderbookUpdateMessage,
  OrderbookSnapshot,
} from "../types";

export class RedisService {
  private client: RedisClientType;
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private isConnected: boolean = false;

  constructor(redisUrl: string = "redis://localhost:6379") {
    this.client = createClient({ url: redisUrl });
    this.publisher = createClient({ url: redisUrl });
    this.subscriber = createClient({ url: redisUrl });

    this.setupErrorHandlers();
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);

      this.isConnected = true;
      console.log("Redis connections established");
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.disconnect(),
      this.publisher.disconnect(),
      this.subscriber.disconnect(),
    ]);
    this.isConnected = false;
    console.log("Redis connections closed");
  }

  // Publish trade execution
  async publishTrade(trade: TradeMessage): Promise<void> {
    if (!this.isConnected) return;

    const channel = `market:${trade.trade.buyerOrderId}:trades`;
    await this.publisher.publish(channel, JSON.stringify(trade));

    // Also publish to general trades channel
    await this.publisher.publish("trades:all", JSON.stringify(trade));
  }

  // Publish orderbook update
  async publishOrderbookUpdate(
    tradingPair: string,
    snapshot: OrderbookSnapshot
  ): Promise<void> {
    if (!this.isConnected) return;

    const message: OrderbookUpdateMessage = {
      type: "ORDERBOOK_UPDATE",
      tradingPair,
      snapshot,
      timestamp: new Date(),
    };

    const channel = `market:${tradingPair}:orderbook`;
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  // Publish order status update
  async publishOrderUpdate(order: OrderMessage): Promise<void> {
    if (!this.isConnected) return;

    if (order.order.userId) {
      const channel = `user:${order.order.userId}:orders`;
      await this.publisher.publish(channel, JSON.stringify(order));
    }

    // Also publish to general orders channel
    await this.publisher.publish("orders:all", JSON.stringify(order));
  }

  // Subscribe to channels
  async subscribeToTrades(
    tradingPair: string,
    callback: (trade: TradeMessage) => void
  ): Promise<void> {
    const channel = `market:${tradingPair}:trades`;
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const trade = JSON.parse(message) as TradeMessage;
        callback(trade);
      } catch (error) {
        console.error("Error parsing trade message:", error);
      }
    });
  }

  async subscribeToOrderbook(
    tradingPair: string,
    callback: (update: OrderbookUpdateMessage) => void
  ): Promise<void> {
    const channel = `market:${tradingPair}:orderbook`;
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const update = JSON.parse(message) as OrderbookUpdateMessage;
        callback(update);
      } catch (error) {
        console.error("Error parsing orderbook message:", error);
      }
    });
  }

  async subscribeToUserOrders(
    userId: string,
    callback: (order: OrderMessage) => void
  ): Promise<void> {
    const channel = `user:${userId}:orders`;
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const orderMsg = JSON.parse(message) as OrderMessage;
        callback(orderMsg);
      } catch (error) {
        console.error("Error parsing order message:", error);
      }
    });
  }

  // Queue operations for order processing
  async pushOrder(order: OrderMessage): Promise<void> {
    if (!this.isConnected) return;

    await this.client.lPush("orders:new", JSON.stringify(order));
  }

  async popOrder(): Promise<OrderMessage | null> {
    if (!this.isConnected) return null;

    const result = await this.client.brPop("orders:new", 1);
    if (result) {
      return JSON.parse(result.element) as OrderMessage;
    }
    return null;
  }

  // Store orderbook snapshots for persistence
  async storeOrderbookSnapshot(
    tradingPair: string,
    snapshot: OrderbookSnapshot
  ): Promise<void> {
    if (!this.isConnected) return;

    const key = `orderbook:${tradingPair}:snapshot`;
    await this.client.set(key, JSON.stringify(snapshot));

    // Set expiration (e.g., 1 hour)
    await this.client.expire(key, 3600);
  }

  async getOrderbookSnapshot(
    tradingPair: string
  ): Promise<OrderbookSnapshot | null> {
    if (!this.isConnected) return null;

    const key = `orderbook:${tradingPair}:snapshot`;
    const data = await this.client.get(key);

    if (data) {
      return JSON.parse(data) as OrderbookSnapshot;
    }
    return null;
  }

  // Store trade history
  async storeTrade(trade: TradeMessage): Promise<void> {
    if (!this.isConnected) return;

    const key = `trades:${trade.trade.buyerOrderId}:history`;
    await this.client.lPush(key, JSON.stringify(trade));

    // Keep only last 1000 trades per pair
    await this.client.lTrim(key, 0, 999);
  }

  async getRecentTrades(
    tradingPair: string,
    limit: number = 50
  ): Promise<TradeMessage[]> {
    if (!this.isConnected) return [];

    const key = `trades:${tradingPair}:history`;
    const trades = await this.client.lRange(key, 0, limit - 1);

    return trades.map((trade) => JSON.parse(trade) as TradeMessage);
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      return false;
    }
  }

  // Store data with TTL
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;

    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  // Get data
  async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    return await this.client.get(key);
  }

  private setupErrorHandlers(): void {
    this.client.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    this.publisher.on("error", (err) => {
      console.error("Redis Publisher Error:", err);
    });

    this.subscriber.on("error", (err) => {
      console.error("Redis Subscriber Error:", err);
    });
  }
}
