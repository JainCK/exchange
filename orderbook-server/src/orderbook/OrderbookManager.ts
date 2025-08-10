import { Orderbook } from "./Orderbook";
import { RedisService } from "../redis/RedisService";
import { RiskManager } from "../risk/RiskManager";
import { TradeExecutor } from "../execution/TradeExecutor";
import {
  Order,
  OrderResult,
  TRADING_PAIRS,
  TradingPair,
  OrderbookSnapshot,
  TradeMessage,
  OrderMessage,
} from "../types";
import { v4 as uuidv4 } from "uuid";

export class OrderbookManager {
  private orderbooks: Map<string, Orderbook>;
  private redisService: RedisService;
  private tradingPairs: Map<string, TradingPair>;
  private riskManager: RiskManager;
  private tradeExecutor: TradeExecutor;

  constructor(redisService: RedisService) {
    this.orderbooks = new Map();
    this.redisService = redisService;
    this.tradingPairs = new Map();

    // Initialize enhanced services
    this.riskManager = new RiskManager();
    this.tradeExecutor = new TradeExecutor(this.riskManager, redisService);

    this.initializeTradingPairs();
  }

  private initializeTradingPairs(): void {
    TRADING_PAIRS.forEach((pair) => {
      this.tradingPairs.set(pair.symbol, pair);
      // Create enhanced orderbook with risk management and trade execution
      this.orderbooks.set(
        pair.symbol,
        new Orderbook(pair, this.riskManager, this.tradeExecutor)
      );
    });

    console.log(
      `Initialized ${TRADING_PAIRS.length} enhanced trading pairs:`,
      TRADING_PAIRS.map((p) => p.symbol).join(", ")
    );
  }

  // Process a new order
  async processOrder(orderData: {
    tradingPair: string;
    side: "buy" | "sell";
    orderType: "limit" | "market";
    price?: number;
    quantity: number;
    timeInForce?: "GTC" | "IOC" | "FOK";
    userId?: string;
  }): Promise<OrderResult> {
    const orderbook = this.orderbooks.get(orderData.tradingPair);
    if (!orderbook) {
      return {
        orderId: "invalid",
        status: "rejected",
        executedQuantity: 0,
        remainingQuantity: orderData.quantity,
        averagePrice: 0,
        fills: [],
        message: `Trading pair ${orderData.tradingPair} not found`,
      };
    }

    // Create order object with enhanced fields
    const order: Order = {
      orderId: uuidv4(),
      userId: orderData.userId,
      tradingPair: orderData.tradingPair,
      side: orderData.side,
      orderType: orderData.orderType,
      price: orderData.price || 0,
      quantity: orderData.quantity,
      filledQuantity: 0,
      remainingQuantity: orderData.quantity,
      status: "pending",
      timeInForce: orderData.timeInForce || "GTC",
      createdAt: new Date(),
      updatedAt: new Date(),
      sequenceNumber: 0, // Will be set by orderbook
      priority: 0, // Will be calculated by orderbook
    };

    // Execute the order (now async)
    const result = await orderbook.addOrder(order);

    // Publish trade messages for any fills
    for (const fill of result.fills) {
      const tradeMessage: TradeMessage = {
        type: "TRADE_EXECUTED",
        trade: fill,
        timestamp: new Date(),
      };

      await this.redisService.publishTrade(tradeMessage);
      await this.redisService.storeTrade(tradeMessage);
    }

    // Publish order update
    const orderStatus = result.status === "accepted" ? "open" : result.status;
    const orderMessage: OrderMessage = {
      type: "NEW_ORDER",
      order: {
        ...order,
        status: orderStatus,
        filledQuantity: result.executedQuantity,
        remainingQuantity: result.remainingQuantity,
      },
      timestamp: new Date(),
    };

    await this.redisService.publishOrderUpdate(orderMessage);

    // Publish orderbook update if there were changes
    if (result.fills.length > 0 || result.status === "open") {
      const snapshot = orderbook.getSnapshot();
      await this.redisService.publishOrderbookUpdate(
        orderData.tradingPair,
        snapshot
      );
      await this.redisService.storeOrderbookSnapshot(
        orderData.tradingPair,
        snapshot
      );
    }

    return result;
  }

  // Cancel an order
  async cancelOrder(orderId: string, tradingPair: string): Promise<boolean> {
    const orderbook = this.orderbooks.get(tradingPair);
    if (!orderbook) return false;

    const cancelled = orderbook.cancelOrder(orderId);

    if (cancelled) {
      // Publish orderbook update
      const snapshot = orderbook.getSnapshot();
      await this.redisService.publishOrderbookUpdate(tradingPair, snapshot);
      await this.redisService.storeOrderbookSnapshot(tradingPair, snapshot);
    }

    return cancelled;
  }

  // Get orderbook snapshot
  getOrderbookSnapshot(
    tradingPair: string,
    depth: number = 20
  ): OrderbookSnapshot | null {
    const orderbook = this.orderbooks.get(tradingPair);
    if (!orderbook) return null;

    return orderbook.getSnapshot(depth);
  }

  // Get all trading pairs
  getTradingPairs(): TradingPair[] {
    return Array.from(this.tradingPairs.values());
  }

  // Get trading pair by symbol
  getTradingPair(symbol: string): TradingPair | undefined {
    return this.tradingPairs.get(symbol);
  }

  // Get market stats for a trading pair
  getMarketStats(tradingPair: string) {
    const orderbook = this.orderbooks.get(tradingPair);
    if (!orderbook) return null;

    return orderbook.getMarketStats();
  }

  // Get market stats for all pairs
  getAllMarketStats() {
    const stats: { [symbol: string]: any } = {};

    for (const [symbol, orderbook] of this.orderbooks) {
      stats[symbol] = orderbook.getMarketStats();
    }

    return stats;
  }

  // Initialize with some sample liquidity (for testing)
  async initializeSampleLiquidity(): Promise<void> {
    console.log("Initializing sample liquidity...");

    // Sample orders for BTCUSD
    const btcOrders = [
      // Bids
      { side: "buy" as const, price: 49500, quantity: 0.1 },
      { side: "buy" as const, price: 49400, quantity: 0.2 },
      { side: "buy" as const, price: 49300, quantity: 0.15 },
      { side: "buy" as const, price: 49200, quantity: 0.3 },
      { side: "buy" as const, price: 49100, quantity: 0.25 },

      // Asks
      { side: "sell" as const, price: 50500, quantity: 0.1 },
      { side: "sell" as const, price: 50600, quantity: 0.2 },
      { side: "sell" as const, price: 50700, quantity: 0.15 },
      { side: "sell" as const, price: 50800, quantity: 0.3 },
      { side: "sell" as const, price: 50900, quantity: 0.25 },
    ];

    for (const orderData of btcOrders) {
      await this.processOrder({
        tradingPair: "BTCUSD",
        side: orderData.side,
        orderType: "limit",
        price: orderData.price,
        quantity: orderData.quantity,
        userId: "system",
      });
    }

    // Sample orders for ETHUSD
    const ethOrders = [
      // Bids
      { side: "buy" as const, price: 2980, quantity: 1.0 },
      { side: "buy" as const, price: 2970, quantity: 2.0 },
      { side: "buy" as const, price: 2960, quantity: 1.5 },

      // Asks
      { side: "sell" as const, price: 3020, quantity: 1.0 },
      { side: "sell" as const, price: 3030, quantity: 2.0 },
      { side: "sell" as const, price: 3040, quantity: 1.5 },
    ];

    for (const orderData of ethOrders) {
      await this.processOrder({
        tradingPair: "ETHUSD",
        side: orderData.side,
        orderType: "limit",
        price: orderData.price,
        quantity: orderData.quantity,
        userId: "system",
      });
    }

    // Sample orders for LTCUSD
    const ltcOrders = [
      // Bids
      { side: "buy" as const, price: 98, quantity: 10 },
      { side: "buy" as const, price: 97, quantity: 20 },

      // Asks
      { side: "sell" as const, price: 102, quantity: 10 },
      { side: "sell" as const, price: 103, quantity: 20 },
    ];

    for (const orderData of ltcOrders) {
      await this.processOrder({
        tradingPair: "LTCUSD",
        side: orderData.side,
        orderType: "limit",
        price: orderData.price,
        quantity: orderData.quantity,
        userId: "system",
      });
    }

    console.log("Sample liquidity initialized for all trading pairs");
  }

  // Get user position information
  getUserPosition(userId: string, tradingPair: string) {
    return this.riskManager.getUserPositionInfo(userId, tradingPair);
  }

  // Get trade statistics
  async getTradeStats(
    tradingPair: string,
    timeframe: "1h" | "24h" | "7d" = "24h"
  ) {
    return this.tradeExecutor.getTradeStats(tradingPair, timeframe);
  }

  // Set custom risk limits
  setRiskLimits(tradingPair: string, limits: any) {
    this.riskManager.setRiskLimits(tradingPair, limits);
  }

  // Set trading fee rate
  setTradingFee(rate: number) {
    this.tradeExecutor.setFeeRate(rate);
  }

  // Get current trading fee rate
  getTradingFee(): number {
    return this.tradeExecutor.getFeeRate();
  }

  // Reset daily volume limits (should be called daily)
  resetDailyLimits() {
    this.riskManager.resetDailyVolume();
  }

  // Get enhanced market statistics
  getEnhancedMarketStats() {
    const stats: any = {};

    this.orderbooks.forEach((orderbook, symbol) => {
      try {
        const basicStats = orderbook.getMarketStats();

        stats[symbol] = {
          ...basicStats,
          tradingFee: this.getTradingFee(),
          spread:
            basicStats.bestAsk && basicStats.bestBid
              ? (
                  ((basicStats.bestAsk - basicStats.bestBid) /
                    basicStats.bestBid) *
                  100
                ).toFixed(2) + "%"
              : "N/A",
          midPrice:
            basicStats.bestAsk && basicStats.bestBid
              ? ((basicStats.bestAsk + basicStats.bestBid) / 2).toFixed(2)
              : "N/A",
          // Add trading pair info
          tradingPair: symbol,
          minOrderSize: this.tradingPairs.get(symbol)?.minOrderSize || 0,
          maxOrderSize: this.tradingPairs.get(symbol)?.maxOrderSize || 0,
          pricePrecision: this.tradingPairs.get(symbol)?.pricePrecision || 2,
          quantityPrecision:
            this.tradingPairs.get(symbol)?.quantityPrecision || 4,
          isActive: this.tradingPairs.get(symbol)?.isActive || false,
        };
      } catch (error) {
        console.error(`Error processing stats for ${symbol}:`, error);
      }
    });

    return stats;
  }
}
