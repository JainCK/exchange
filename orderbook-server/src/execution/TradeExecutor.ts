import { Order, Fill, TradeExecution } from "../types";
import { RiskManager } from "../risk/RiskManager";
import { RedisService } from "../redis/RedisService";

export class TradeExecutor {
  private riskManager: RiskManager;
  private redisService: RedisService;
  private sequenceCounter: number = 0;
  private feeRate: number = 0.001; // 0.1% trading fee

  constructor(riskManager: RiskManager, redisService: RedisService) {
    this.riskManager = riskManager;
    this.redisService = redisService;
  }

  /**
   * Execute a trade between two matching orders with enhanced features
   */
  public async executeTrade(
    buyOrder: Order,
    sellOrder: Order,
    matchedQuantity: number,
    matchedPrice: number
  ): Promise<TradeExecution | null> {
    try {
      // Pre-execution validation
      if (
        !this.validateTradeExecution(
          buyOrder,
          sellOrder,
          matchedQuantity,
          matchedPrice
        )
      ) {
        console.error("Trade execution validation failed");
        return null;
      }

      // Calculate fees
      const tradeValue = matchedQuantity * matchedPrice;
      const buyerFee = this.calculateFee(tradeValue, buyOrder.userId);
      const sellerFee = this.calculateFee(tradeValue, sellOrder.userId);

      // Create trade execution record
      const tradeExecution: TradeExecution = {
        tradeId: this.generateTradeId(),
        buyOrder: { ...buyOrder },
        sellOrder: { ...sellOrder },
        price: matchedPrice,
        quantity: matchedQuantity,
        timestamp: new Date(),
        buyerFee,
        sellerFee,
        matchType: this.determineMatchType(
          buyOrder,
          sellOrder,
          matchedQuantity
        ),
      };

      // Execute the trade atomically
      await this.executeTradeAtomically(tradeExecution);

      // Update order statuses
      this.updateOrdersAfterTrade(
        buyOrder,
        sellOrder,
        matchedQuantity,
        matchedPrice
      );

      // Update risk manager positions
      this.updatePositionsAfterTrade(tradeExecution);

      // Publish trade to Redis for real-time updates
      await this.publishTradeExecution(tradeExecution);

      // Log successful execution
      console.log(
        `Trade executed: ${tradeExecution.tradeId} - ${matchedQuantity} @ ${matchedPrice}`
      );

      return tradeExecution;
    } catch (error) {
      console.error("Error executing trade:", error);
      return null;
    }
  }

  private validateTradeExecution(
    buyOrder: Order,
    sellOrder: Order,
    quantity: number,
    price: number
  ): boolean {
    // Basic validation
    if (quantity <= 0 || price <= 0) return false;
    if (buyOrder.side !== "buy" || sellOrder.side !== "sell") return false;
    if (buyOrder.tradingPair !== sellOrder.tradingPair) return false;

    // Price validation
    if (buyOrder.orderType === "limit" && price > buyOrder.price) return false;
    if (sellOrder.orderType === "limit" && price < sellOrder.price)
      return false;

    // Quantity validation
    if (
      quantity > buyOrder.remainingQuantity ||
      quantity > sellOrder.remainingQuantity
    )
      return false;

    // Same user validation
    if (buyOrder.userId === sellOrder.userId) {
      console.warn("Prevented self-trading:", buyOrder.userId);
      return false;
    }

    return true;
  }

  private calculateFee(tradeValue: number, userId?: string): number {
    // Basic fee calculation - can be enhanced with user tiers, volume discounts, etc.
    let feeRate = this.feeRate;

    // VIP user discount example
    if (userId?.startsWith("vip_")) {
      feeRate *= 0.5; // 50% discount for VIP users
    }

    return tradeValue * feeRate;
  }

  private determineMatchType(
    buyOrder: Order,
    sellOrder: Order,
    matchedQuantity: number
  ): "full" | "partial_buyer" | "partial_seller" | "partial_both" {
    const buyerFullyFilled = matchedQuantity === buyOrder.remainingQuantity;
    const sellerFullyFilled = matchedQuantity === sellOrder.remainingQuantity;

    if (buyerFullyFilled && sellerFullyFilled) return "full";
    if (buyerFullyFilled && !sellerFullyFilled) return "partial_seller";
    if (!buyerFullyFilled && sellerFullyFilled) return "partial_buyer";
    return "partial_both";
  }

  private async executeTradeAtomically(
    tradeExecution: TradeExecution
  ): Promise<void> {
    // In a real system, this would use database transactions
    // For now, we'll ensure atomicity through careful ordering

    try {
      // 1. Create the fill records
      const fill: Fill = {
        price: tradeExecution.price,
        quantity: tradeExecution.quantity,
        tradeId: tradeExecution.tradeId,
        timestamp: tradeExecution.timestamp,
        buyerOrderId: tradeExecution.buyOrder.orderId,
        sellerOrderId: tradeExecution.sellOrder.orderId,
        buyerUserId: tradeExecution.buyOrder.userId,
        sellerUserId: tradeExecution.sellOrder.userId,
      };

      // 2. Store trade execution (in real system, this would go to database)
      await this.storeTradeExecution(tradeExecution, fill);
    } catch (error) {
      console.error("Atomic trade execution failed:", error);
      throw error;
    }
  }

  private async storeTradeExecution(
    tradeExecution: TradeExecution,
    fill: Fill
  ): Promise<void> {
    // Store in Redis for now (in production, use proper database)
    const tradeData = {
      execution: tradeExecution,
      fill: fill,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.set(
      `trade:${tradeExecution.tradeId}`,
      JSON.stringify(tradeData),
      86400 // 24 hours TTL
    );
  }

  private updateOrdersAfterTrade(
    buyOrder: Order,
    sellOrder: Order,
    matchedQuantity: number,
    matchedPrice: number
  ): void {
    const now = new Date();

    // Update buy order
    buyOrder.filledQuantity += matchedQuantity;
    buyOrder.remainingQuantity -= matchedQuantity;
    buyOrder.updatedAt = now;

    // Calculate average price for buyer
    const totalFilledValue =
      (buyOrder.averagePrice || 0) *
        (buyOrder.filledQuantity - matchedQuantity) +
      matchedPrice * matchedQuantity;
    buyOrder.averagePrice = totalFilledValue / buyOrder.filledQuantity;

    if (buyOrder.remainingQuantity <= 0) {
      buyOrder.status = "filled";
    } else {
      buyOrder.status = "partially_filled";
    }

    // Update sell order
    sellOrder.filledQuantity += matchedQuantity;
    sellOrder.remainingQuantity -= matchedQuantity;
    sellOrder.updatedAt = now;

    // Calculate average price for seller
    const totalSellerValue =
      (sellOrder.averagePrice || 0) *
        (sellOrder.filledQuantity - matchedQuantity) +
      matchedPrice * matchedQuantity;
    sellOrder.averagePrice = totalSellerValue / sellOrder.filledQuantity;

    if (sellOrder.remainingQuantity <= 0) {
      sellOrder.status = "filled";
    } else {
      sellOrder.status = "partially_filled";
    }
  }

  private updatePositionsAfterTrade(tradeExecution: TradeExecution): void {
    const { buyOrder, sellOrder, quantity, price, buyerFee, sellerFee } =
      tradeExecution;

    // Update buyer position
    if (buyOrder.userId) {
      this.riskManager.updateUserPosition(
        buyOrder.userId,
        buyOrder.tradingPair,
        "buy",
        quantity,
        price
      );
    }

    // Update seller position
    if (sellOrder.userId) {
      this.riskManager.updateUserPosition(
        sellOrder.userId,
        sellOrder.tradingPair,
        "sell",
        quantity,
        price
      );
    }

    // Update market price in risk manager
    this.riskManager.updateMarketPrice(buyOrder.tradingPair, price);
  }

  private async publishTradeExecution(
    tradeExecution: TradeExecution
  ): Promise<void> {
    try {
      // Publish to trade channel
      await this.redisService.publishTrade({
        type: "TRADE_EXECUTED",
        trade: {
          price: tradeExecution.price,
          quantity: tradeExecution.quantity,
          tradeId: tradeExecution.tradeId,
          timestamp: tradeExecution.timestamp,
          buyerOrderId: tradeExecution.buyOrder.orderId,
          sellerOrderId: tradeExecution.sellOrder.orderId,
          buyerUserId: tradeExecution.buyOrder.userId,
          sellerUserId: tradeExecution.sellOrder.userId,
        },
        timestamp: tradeExecution.timestamp,
      });

      // Publish order updates
      await this.publishOrderUpdate(tradeExecution.buyOrder);
      await this.publishOrderUpdate(tradeExecution.sellOrder);
    } catch (error) {
      console.error("Error publishing trade execution:", error);
    }
  }

  private async publishOrderUpdate(order: Order): Promise<void> {
    await this.redisService.publishOrderUpdate({
      type: "ORDER_UPDATE",
      order,
      timestamp: new Date(),
    });
  }

  private generateTradeId(): string {
    const timestamp = Date.now();
    const sequence = ++this.sequenceCounter;
    return `trade_${timestamp}_${sequence}`;
  }

  /**
   * Calculate priority score for price-time priority matching
   */
  public calculatePriority(order: Order): number {
    // Price priority: better prices get higher priority
    let pricePriority = order.side === "buy" ? order.price : -order.price;

    // Time priority: earlier orders get higher priority (smaller sequence number)
    let timePriority = -order.sequenceNumber / 1000000; // Normalize to small decimal

    // Combine price and time priority
    return pricePriority + timePriority;
  }

  /**
   * Get trade statistics
   */
  public async getTradeStats(
    tradingPair: string,
    timeframe: "1h" | "24h" | "7d" = "24h"
  ): Promise<any> {
    // This would typically query a proper database
    // For now, return mock data
    return {
      tradingPair,
      timeframe,
      volume: 1000000,
      trades: 1523,
      high: 45000,
      low: 43500,
      open: 44000,
      close: 44750,
      change: 0.017,
    };
  }

  /**
   * Set trading fee rate
   */
  public setFeeRate(rate: number): void {
    if (rate >= 0 && rate <= 0.01) {
      // Max 1% fee
      this.feeRate = rate;
    }
  }

  /**
   * Get current fee rate
   */
  public getFeeRate(): number {
    return this.feeRate;
  }
}
