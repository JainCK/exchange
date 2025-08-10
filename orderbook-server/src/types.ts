import { z } from "zod";

// Trading pair configuration
export interface TradingPair {
  symbol: string; // e.g., "BTCUSD"
  baseAsset: string; // e.g., "BTC"
  quoteAsset: string; // e.g., "USD"
  minOrderSize: number;
  maxOrderSize: number;
  pricePrecision: number;
  quantityPrecision: number;
  isActive: boolean;
}

// Order types
export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type TimeInForce = "GTC" | "IOC" | "FOK"; // Good Till Cancel, Immediate or Cancel, Fill or Kill
export type OrderStatus =
  | "pending"
  | "open"
  | "filled"
  | "cancelled"
  | "rejected"
  | "partially_filled";

// Base order interface
export interface Order {
  orderId: string;
  userId?: string;
  tradingPair: string;
  side: OrderSide;
  orderType: OrderType;
  price: number; // For market orders, this will be 0 initially
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  timeInForce: TimeInForce;
  createdAt: Date;
  updatedAt: Date;
  // Enhanced fields for advanced matching
  sequenceNumber: number; // For time priority within same price
  priority: number; // Price-time priority score
  averagePrice?: number; // Average fill price
  fees?: number; // Trading fees paid
}

// Bid and Ask specific interfaces
export interface Bid extends Order {
  side: "buy";
}

export interface Ask extends Order {
  side: "sell";
}

// Fill/Trade information
export interface Fill {
  price: number;
  quantity: number;
  tradeId: string;
  timestamp: Date;
  buyerOrderId: string;
  sellerOrderId: string;
  buyerUserId?: string;
  sellerUserId?: string;
}

// Orderbook structure
export interface Orderbook {
  tradingPair: string;
  bids: Bid[];
  asks: Ask[];
  lastPrice: number;
  volume24h: number;
  priceChange24h: number;
}

// Price level aggregated view
export interface PriceLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderbookSnapshot {
  tradingPair: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  timestamp: Date;
}

// Order input validation schemas
export const OrderInputSchema = z.object({
  tradingPair: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["limit", "market"]),
  price: z.number().min(0).optional(), // Optional for market orders
  quantity: z.number().min(0.000001),
  timeInForce: z.enum(["GTC", "IOC", "FOK"]).default("GTC"),
  userId: z.string().optional(),
});

export const MarketOrderSchema = OrderInputSchema.extend({
  orderType: z.literal("market"),
  price: z.number().optional(), // Market orders don't need price
});

export const LimitOrderSchema = OrderInputSchema.extend({
  orderType: z.literal("limit"),
  price: z.number().min(0), // Limit orders require price
});

// Order execution result
export interface OrderResult {
  orderId: string;
  status: "accepted" | "rejected" | "filled" | "partially_filled" | "open";
  executedQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  fills: Fill[];
  message?: string;
}

// Trading pair definitions
export const TRADING_PAIRS: TradingPair[] = [
  {
    symbol: "BTCUSD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    minOrderSize: 0.00001,
    maxOrderSize: 1000,
    pricePrecision: 2,
    quantityPrecision: 8,
    isActive: true,
  },
  {
    symbol: "ETHUSD",
    baseAsset: "ETH",
    quoteAsset: "USD",
    minOrderSize: 0.001,
    maxOrderSize: 10000,
    pricePrecision: 2,
    quantityPrecision: 6,
    isActive: true,
  },
  {
    symbol: "LTCUSD",
    baseAsset: "LTC",
    quoteAsset: "USD",
    minOrderSize: 0.01,
    maxOrderSize: 50000,
    pricePrecision: 2,
    quantityPrecision: 4,
    isActive: true,
  },
];

// Risk Management Types
export interface RiskLimits {
  maxOrderSize: number;
  maxDailyVolume: number;
  maxOpenOrders: number;
  maxPositionSize: number;
  minPriceDeviation: number; // Minimum price change from market
  maxPriceDeviation: number; // Maximum price change from market
}

export interface UserPosition {
  userId: string;
  tradingPair: string;
  baseBalance: number; // Available base asset
  quoteBalance: number; // Available quote asset
  lockedBase: number; // Base asset locked in open orders
  lockedQuote: number; // Quote asset locked in open orders
  dailyVolume: number; // Daily trading volume
  openOrderCount: number;
  lastTradeTime: Date;
}

export interface RiskCheckResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TradeExecution {
  tradeId: string;
  buyOrder: Order;
  sellOrder: Order;
  price: number;
  quantity: number;
  timestamp: Date;
  buyerFee: number;
  sellerFee: number;
  matchType: "full" | "partial_buyer" | "partial_seller" | "partial_both";
}

// Redis message types
export interface OrderMessage {
  type: "NEW_ORDER" | "CANCEL_ORDER" | "ORDER_UPDATE";
  order: Order;
  timestamp: Date;
}

export interface TradeMessage {
  type: "TRADE_EXECUTED";
  trade: Fill;
  timestamp: Date;
}

export interface OrderbookUpdateMessage {
  type: "ORDERBOOK_UPDATE";
  tradingPair: string;
  snapshot: OrderbookSnapshot;
  timestamp: Date;
}
