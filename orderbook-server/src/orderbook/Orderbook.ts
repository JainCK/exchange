import { PriceLevelTree } from "../data-structures/PriceLevelTree";
import {
  Order,
  Bid,
  Ask,
  Fill,
  OrderResult,
  OrderbookSnapshot,
  PriceLevel,
  TradingPair,
  OrderSide,
  OrderType,
} from "../types";
import { v4 as uuidv4 } from "uuid";

export class Orderbook {
  private tradingPair: TradingPair;
  private bids: PriceLevelTree; // Sorted by price descending (highest first)
  private asks: PriceLevelTree; // Sorted by price ascending (lowest first)
  private orders: Map<string, Order>; // All active orders by ID
  private lastPrice: number = 0;
  private volume24h: number = 0;
  private priceChange24h: number = 0;

  constructor(tradingPair: TradingPair) {
    this.tradingPair = tradingPair;
    this.bids = new PriceLevelTree(false); // Descending for bids
    this.asks = new PriceLevelTree(true); // Ascending for asks
    this.orders = new Map();
  }

  // Add a new order to the orderbook
  addOrder(order: Order): OrderResult {
    try {
      // Validate order
      const validation = this.validateOrder(order);
      if (!validation.isValid) {
        return {
          orderId: order.orderId,
          status: "rejected",
          executedQuantity: 0,
          remainingQuantity: order.quantity,
          averagePrice: 0,
          fills: [],
          message: validation.message,
        };
      }

      // Handle market orders
      if (order.orderType === "market") {
        return this.executeMarketOrder(order);
      }

      // Handle limit orders
      return this.executeLimitOrder(order);
    } catch (error) {
      console.error("Error adding order:", error);
      return {
        orderId: order.orderId,
        status: "rejected",
        executedQuantity: 0,
        remainingQuantity: order.quantity,
        averagePrice: 0,
        fills: [],
        message: "Internal error processing order",
      };
    }
  }

  // Execute a market order
  private executeMarketOrder(order: Order): OrderResult {
    const fills: Fill[] = [];
    let remainingQuantity = order.quantity;
    let totalExecutedQuantity = 0;
    let totalExecutedValue = 0;

    // Get opposite side tree
    const oppositeTree = order.side === "buy" ? this.asks : this.bids;

    if (oppositeTree.isEmpty()) {
      return {
        orderId: order.orderId,
        status: "rejected",
        executedQuantity: 0,
        remainingQuantity: order.quantity,
        averagePrice: 0,
        fills: [],
        message: "No liquidity available",
      };
    }

    // Execute against best available prices
    while (remainingQuantity > 0 && !oppositeTree.isEmpty()) {
      const bestPrice = oppositeTree.getBestPrice();
      if (!bestPrice) break;

      const level = oppositeTree.getLevel(bestPrice);
      if (!level) break;

      const fillQuantity = Math.min(remainingQuantity, level.totalQuantity);

      // Execute the fill
      const fill = this.createFill(order, bestPrice, fillQuantity);
      fills.push(fill);

      totalExecutedQuantity += fillQuantity;
      totalExecutedValue += fillQuantity * bestPrice;
      remainingQuantity -= fillQuantity;

      // Update the opposite level
      this.updatePriceLevel(
        oppositeTree,
        bestPrice,
        fillQuantity,
        level.orderIds[0]
      );

      // Update last price
      this.lastPrice = bestPrice;
    }

    const averagePrice =
      totalExecutedQuantity > 0
        ? totalExecutedValue / totalExecutedQuantity
        : 0;

    // For IOC market orders, reject if not fully filled
    if (order.timeInForce === "IOC" && remainingQuantity > 0) {
      return {
        orderId: order.orderId,
        status: "rejected",
        executedQuantity: totalExecutedQuantity,
        remainingQuantity,
        averagePrice,
        fills: [],
        message: "IOC order not fully executable",
      };
    }

    const status =
      remainingQuantity === 0
        ? "filled"
        : totalExecutedQuantity > 0
        ? "partially_filled"
        : "rejected";

    return {
      orderId: order.orderId,
      status,
      executedQuantity: totalExecutedQuantity,
      remainingQuantity,
      averagePrice,
      fills,
    };
  }

  // Execute a limit order
  private executeLimitOrder(order: Order): OrderResult {
    const fills: Fill[] = [];
    let remainingQuantity = order.quantity;
    let totalExecutedQuantity = 0;
    let totalExecutedValue = 0;

    // First, try to match against existing orders
    const oppositeTree = order.side === "buy" ? this.asks : this.bids;

    while (remainingQuantity > 0 && !oppositeTree.isEmpty()) {
      const bestPrice = oppositeTree.getBestPrice();
      if (!bestPrice) break;

      // Check if we can match
      const canMatch =
        order.side === "buy"
          ? bestPrice <= order.price
          : bestPrice >= order.price;

      if (!canMatch) break;

      const level = oppositeTree.getLevel(bestPrice);
      if (!level) break;

      const fillQuantity = Math.min(remainingQuantity, level.totalQuantity);

      // Execute the fill
      const fill = this.createFill(order, bestPrice, fillQuantity);
      fills.push(fill);

      totalExecutedQuantity += fillQuantity;
      totalExecutedValue += fillQuantity * bestPrice;
      remainingQuantity -= fillQuantity;

      // Update the opposite level
      this.updatePriceLevel(
        oppositeTree,
        bestPrice,
        fillQuantity,
        level.orderIds[0]
      );

      // Update last price
      this.lastPrice = bestPrice;
    }

    // Handle different time in force options
    if (order.timeInForce === "FOK" && remainingQuantity > 0) {
      return {
        orderId: order.orderId,
        status: "rejected",
        executedQuantity: 0,
        remainingQuantity: order.quantity,
        averagePrice: 0,
        fills: [],
        message: "FOK order not fully executable",
      };
    }

    if (order.timeInForce === "IOC") {
      const status =
        totalExecutedQuantity === order.quantity
          ? "filled"
          : "partially_filled";
      const averagePrice =
        totalExecutedQuantity > 0
          ? totalExecutedValue / totalExecutedQuantity
          : 0;

      return {
        orderId: order.orderId,
        status,
        executedQuantity: totalExecutedQuantity,
        remainingQuantity,
        averagePrice,
        fills,
      };
    }

    // Place remaining quantity on the book (GTC orders)
    if (remainingQuantity > 0) {
      const updatedOrder: Order = {
        ...order,
        filledQuantity: totalExecutedQuantity,
        remainingQuantity,
        status: totalExecutedQuantity > 0 ? "partially_filled" : "open",
      };

      this.orders.set(order.orderId, updatedOrder);

      const tree = order.side === "buy" ? this.bids : this.asks;
      tree.addOrder(order.price, remainingQuantity, order.orderId);
    }

    const averagePrice =
      totalExecutedQuantity > 0
        ? totalExecutedValue / totalExecutedQuantity
        : 0;
    const status =
      remainingQuantity === 0
        ? "filled"
        : totalExecutedQuantity > 0
        ? "partially_filled"
        : "open";

    return {
      orderId: order.orderId,
      status,
      executedQuantity: totalExecutedQuantity,
      remainingQuantity,
      averagePrice,
      fills,
    };
  }

  // Cancel an order
  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;

    const tree = order.side === "buy" ? this.bids : this.asks;
    tree.removeOrder(order.price, order.remainingQuantity, orderId);

    order.status = "cancelled";
    this.orders.delete(orderId);

    return true;
  }

  // Get orderbook snapshot
  getSnapshot(depth: number = 20): OrderbookSnapshot {
    const bids = this.bids.getTopLevels(depth).map((level) => ({
      price: level.price,
      quantity: level.totalQuantity,
      orderCount: level.orderCount,
    }));

    const asks = this.asks.getTopLevels(depth).map((level) => ({
      price: level.price,
      quantity: level.totalQuantity,
      orderCount: level.orderCount,
    }));

    return {
      tradingPair: this.tradingPair.symbol,
      bids,
      asks,
      timestamp: new Date(),
    };
  }

  // Get trading pair info
  getTradingPair(): TradingPair {
    return this.tradingPair;
  }

  // Get market stats
  getMarketStats() {
    return {
      lastPrice: this.lastPrice,
      volume24h: this.volume24h,
      priceChange24h: this.priceChange24h,
      bestBid: this.bids.getBestPrice(),
      bestAsk: this.asks.getBestPrice(),
    };
  }

  private validateOrder(order: Order): { isValid: boolean; message?: string } {
    // Check quantity bounds
    if (order.quantity < this.tradingPair.minOrderSize) {
      return {
        isValid: false,
        message: `Order size below minimum: ${this.tradingPair.minOrderSize}`,
      };
    }

    if (order.quantity > this.tradingPair.maxOrderSize) {
      return {
        isValid: false,
        message: `Order size above maximum: ${this.tradingPair.maxOrderSize}`,
      };
    }

    // Check price for limit orders
    if (order.orderType === "limit" && order.price <= 0) {
      return {
        isValid: false,
        message: "Limit orders must have a positive price",
      };
    }

    return { isValid: true };
  }

  private createFill(order: Order, price: number, quantity: number): Fill {
    return {
      price,
      quantity,
      tradeId: uuidv4(),
      timestamp: new Date(),
      buyerOrderId: order.side === "buy" ? order.orderId : "market",
      sellerOrderId: order.side === "sell" ? order.orderId : "market",
      buyerUserId: order.side === "buy" ? order.userId : undefined,
      sellerUserId: order.side === "sell" ? order.userId : undefined,
    };
  }

  private updatePriceLevel(
    tree: PriceLevelTree,
    price: number,
    quantity: number,
    orderId: string
  ): void {
    tree.removeOrder(price, quantity, orderId);

    // Remove the matched order from our orders map
    const matchedOrder = this.orders.get(orderId);
    if (matchedOrder) {
      matchedOrder.filledQuantity += quantity;
      matchedOrder.remainingQuantity -= quantity;

      if (matchedOrder.remainingQuantity <= 0) {
        matchedOrder.status = "filled";
        this.orders.delete(orderId);
      }
    }
  }
}
