import {
  Order,
  RiskLimits,
  UserPosition,
  RiskCheckResult,
  TradingPair,
} from "../types";

export class RiskManager {
  private riskLimits: Map<string, RiskLimits> = new Map();
  private userPositions: Map<string, UserPosition> = new Map();
  private marketPrices: Map<string, number> = new Map();

  constructor() {
    this.initializeDefaultRiskLimits();
  }

  private initializeDefaultRiskLimits(): void {
    const defaultLimits: RiskLimits = {
      maxOrderSize: 1000000, // $1M max order
      maxDailyVolume: 10000000, // $10M daily volume
      maxOpenOrders: 100,
      maxPositionSize: 5000000, // $5M max position
      minPriceDeviation: 0.001, // 0.1% min deviation
      maxPriceDeviation: 0.1, // 10% max deviation
    };

    // Set default limits for all trading pairs
    ["BTCUSD", "ETHUSD", "LTCUSD"].forEach((pair) => {
      this.riskLimits.set(pair, { ...defaultLimits });
    });
  }

  /**
   * Comprehensive risk check for new orders
   */
  public checkOrderRisk(
    order: Order,
    tradingPair: TradingPair
  ): RiskCheckResult {
    const result: RiskCheckResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Get user position
    const userPos = this.getUserPosition(
      order.userId || "anonymous",
      order.tradingPair
    );
    const limits = this.riskLimits.get(order.tradingPair);

    if (!limits) {
      result.isValid = false;
      result.errors.push("No risk limits configured for trading pair");
      return result;
    }

    // 1. Order size checks
    this.checkOrderSize(order, tradingPair, limits, result);

    // 2. Price deviation checks (for limit orders)
    if (order.orderType === "limit") {
      this.checkPriceDeviation(order, limits, result);
    }

    // 3. User position and balance checks
    this.checkUserLimits(order, userPos, limits, result);

    // 4. Market condition checks
    this.checkMarketConditions(order, result);

    // 5. Time-based checks
    this.checkTimeBasedLimits(order, userPos, result);

    return result;
  }

  private checkOrderSize(
    order: Order,
    tradingPair: TradingPair,
    limits: RiskLimits,
    result: RiskCheckResult
  ): void {
    // Check minimum order size
    if (order.quantity < tradingPair.minOrderSize) {
      result.isValid = false;
      result.errors.push(
        `Order size ${order.quantity} below minimum ${tradingPair.minOrderSize}`
      );
    }

    // Check maximum order size
    if (order.quantity > tradingPair.maxOrderSize) {
      result.isValid = false;
      result.errors.push(
        `Order size ${order.quantity} exceeds maximum ${tradingPair.maxOrderSize}`
      );
    }

    // Check order value (quantity * price)
    const orderValue = order.quantity * order.price;
    if (orderValue > limits.maxOrderSize) {
      result.isValid = false;
      result.errors.push(
        `Order value $${orderValue} exceeds limit $${limits.maxOrderSize}`
      );
    }

    // Warning for large orders
    if (orderValue > limits.maxOrderSize * 0.5) {
      result.warnings.push(`Large order detected: $${orderValue}`);
    }
  }

  private checkPriceDeviation(
    order: Order,
    limits: RiskLimits,
    result: RiskCheckResult
  ): void {
    const marketPrice = this.marketPrices.get(order.tradingPair);
    if (!marketPrice) {
      result.warnings.push(
        "No market price available for price deviation check"
      );
      return;
    }

    const deviation = Math.abs(order.price - marketPrice) / marketPrice;

    if (deviation < limits.minPriceDeviation) {
      result.warnings.push(
        `Order price too close to market (${(deviation * 100).toFixed(2)}%)`
      );
    }

    if (deviation > limits.maxPriceDeviation) {
      result.isValid = false;
      result.errors.push(
        `Order price deviates too much from market (${(deviation * 100).toFixed(
          2
        )}%)`
      );
    }
  }

  private checkUserLimits(
    order: Order,
    userPos: UserPosition,
    limits: RiskLimits,
    result: RiskCheckResult
  ): void {
    // Check open order count
    if (userPos.openOrderCount >= limits.maxOpenOrders) {
      result.isValid = false;
      result.errors.push(
        `User has reached maximum open orders limit (${limits.maxOpenOrders})`
      );
    }

    // Check daily volume
    const orderValue = order.quantity * order.price;
    if (userPos.dailyVolume + orderValue > limits.maxDailyVolume) {
      result.isValid = false;
      result.errors.push(
        `Order would exceed daily volume limit $${limits.maxDailyVolume}`
      );
    }

    // Check balance requirements
    if (order.side === "buy") {
      const requiredQuote = order.quantity * order.price;
      if (userPos.quoteBalance < requiredQuote) {
        result.isValid = false;
        result.errors.push(
          `Insufficient quote balance. Required: ${requiredQuote}, Available: ${userPos.quoteBalance}`
        );
      }
    } else {
      if (userPos.baseBalance < order.quantity) {
        result.isValid = false;
        result.errors.push(
          `Insufficient base balance. Required: ${order.quantity}, Available: ${userPos.baseBalance}`
        );
      }
    }

    // Position size check
    const currentPositionValue =
      userPos.baseBalance * (this.marketPrices.get(order.tradingPair) || 0);
    if (currentPositionValue > limits.maxPositionSize) {
      result.warnings.push(
        `Position size approaching limit: $${currentPositionValue}`
      );
    }
  }

  private checkMarketConditions(order: Order, result: RiskCheckResult): void {
    // Market hours check (could be extended for specific markets)
    const now = new Date();
    const hour = now.getUTCHours();

    // Simple market hours check (extend this based on actual market schedules)
    if (hour < 6 || hour > 22) {
      result.warnings.push("Trading outside typical market hours");
    }

    // Add more market condition checks here
    // - Circuit breakers
    // - Market volatility
    // - Liquidity checks
  }

  private checkTimeBasedLimits(
    order: Order,
    userPos: UserPosition,
    result: RiskCheckResult
  ): void {
    const now = new Date();
    const timeSinceLastTrade = now.getTime() - userPos.lastTradeTime.getTime();

    // Rate limiting: minimum time between orders (1 second)
    if (timeSinceLastTrade < 1000) {
      result.isValid = false;
      result.errors.push(
        "Order rate limit exceeded. Please wait before placing another order."
      );
    }

    // Warning for rapid trading
    if (timeSinceLastTrade < 5000) {
      result.warnings.push("Rapid trading detected");
    }
  }

  /**
   * Update user position after trade execution
   */
  public updateUserPosition(
    userId: string,
    tradingPair: string,
    side: "buy" | "sell",
    quantity: number,
    price: number
  ): void {
    const userPos = this.getUserPosition(userId, tradingPair);
    const tradeValue = quantity * price;

    if (side === "buy") {
      userPos.baseBalance += quantity;
      userPos.quoteBalance -= tradeValue;
    } else {
      userPos.baseBalance -= quantity;
      userPos.quoteBalance += tradeValue;
    }

    userPos.dailyVolume += tradeValue;
    userPos.lastTradeTime = new Date();

    this.userPositions.set(`${userId}:${tradingPair}`, userPos);
  }

  /**
   * Lock/unlock funds for pending orders
   */
  public lockFunds(
    userId: string,
    tradingPair: string,
    side: "buy" | "sell",
    quantity: number,
    price: number
  ): boolean {
    const userPos = this.getUserPosition(userId, tradingPair);

    if (side === "buy") {
      const requiredQuote = quantity * price;
      if (userPos.quoteBalance >= requiredQuote) {
        userPos.quoteBalance -= requiredQuote;
        userPos.lockedQuote += requiredQuote;
        userPos.openOrderCount++;
        return true;
      }
    } else {
      if (userPos.baseBalance >= quantity) {
        userPos.baseBalance -= quantity;
        userPos.lockedBase += quantity;
        userPos.openOrderCount++;
        return true;
      }
    }

    return false;
  }

  public unlockFunds(
    userId: string,
    tradingPair: string,
    side: "buy" | "sell",
    quantity: number,
    price: number
  ): void {
    const userPos = this.getUserPosition(userId, tradingPair);

    if (side === "buy") {
      const quoteAmount = quantity * price;
      userPos.lockedQuote -= quoteAmount;
      userPos.quoteBalance += quoteAmount;
    } else {
      userPos.lockedBase -= quantity;
      userPos.baseBalance += quantity;
    }

    userPos.openOrderCount = Math.max(0, userPos.openOrderCount - 1);
    this.userPositions.set(`${userId}:${tradingPair}`, userPos);
  }

  /**
   * Get or create user position
   */
  private getUserPosition(userId: string, tradingPair: string): UserPosition {
    const key = `${userId}:${tradingPair}`;
    let position = this.userPositions.get(key);

    if (!position) {
      position = {
        userId,
        tradingPair,
        baseBalance: 1000000, // Default demo balance
        quoteBalance: 1000000, // Default demo balance
        lockedBase: 0,
        lockedQuote: 0,
        dailyVolume: 0,
        openOrderCount: 0,
        lastTradeTime: new Date(0),
      };
      this.userPositions.set(key, position);
    }

    return position;
  }

  /**
   * Update market price for risk calculations
   */
  public updateMarketPrice(tradingPair: string, price: number): void {
    this.marketPrices.set(tradingPair, price);
  }

  /**
   * Get user position info
   */
  public getUserPositionInfo(
    userId: string,
    tradingPair: string
  ): UserPosition {
    return this.getUserPosition(userId, tradingPair);
  }

  /**
   * Reset daily volume (should be called daily)
   */
  public resetDailyVolume(): void {
    this.userPositions.forEach((position) => {
      position.dailyVolume = 0;
    });
  }

  /**
   * Set custom risk limits for a trading pair
   */
  public setRiskLimits(tradingPair: string, limits: RiskLimits): void {
    this.riskLimits.set(tradingPair, limits);
  }
}
