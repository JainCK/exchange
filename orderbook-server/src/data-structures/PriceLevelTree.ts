// Price Level Tree implementation for efficient orderbook operations
// Uses Map with sorted keys for O(log n) operations

export class PriceLevelTree {
  private levels: Map<number, PriceLevel>;
  private sortedPrices: number[];
  private isAscending: boolean; // true for asks (ascending), false for bids (descending)

  constructor(isAscending: boolean = true) {
    this.levels = new Map();
    this.sortedPrices = [];
    this.isAscending = isAscending;
  }

  // Add or update a price level
  addOrder(price: number, quantity: number, orderId: string): void {
    const level = this.levels.get(price);

    if (level) {
      level.totalQuantity += quantity;
      level.orderCount += 1;
      level.orderIds.push(orderId);
    } else {
      this.levels.set(price, {
        price,
        totalQuantity: quantity,
        orderCount: 1,
        orderIds: [orderId],
      });
      this.insertSorted(price);
    }
  }

  // Remove quantity from a price level
  removeOrder(price: number, quantity: number, orderId: string): void {
    const level = this.levels.get(price);
    if (!level) return;

    level.totalQuantity -= quantity;
    level.orderCount -= 1;
    level.orderIds = level.orderIds.filter((id) => id !== orderId);

    if (level.totalQuantity <= 0 || level.orderCount <= 0) {
      this.levels.delete(price);
      this.sortedPrices = this.sortedPrices.filter((p) => p !== price);
    }
  }

  // Get best price (lowest for asks, highest for bids)
  getBestPrice(): number | null {
    if (this.sortedPrices.length === 0) return null;
    return this.sortedPrices[0];
  }

  // Get price level at specific price
  getLevel(price: number): PriceLevel | undefined {
    return this.levels.get(price);
  }

  // Get all levels sorted by price
  getAllLevels(): PriceLevel[] {
    return this.sortedPrices.map((price) => this.levels.get(price)!);
  }

  // Get top N levels
  getTopLevels(n: number): PriceLevel[] {
    return this.sortedPrices
      .slice(0, n)
      .map((price) => this.levels.get(price)!)
      .filter((level) => level.totalQuantity > 0);
  }

  // Check if there are any levels
  isEmpty(): boolean {
    return this.sortedPrices.length === 0;
  }

  // Get total quantity at or better than price
  getQuantityAtOrBetter(targetPrice: number): number {
    let total = 0;
    for (const price of this.sortedPrices) {
      if (this.isAscending && price > targetPrice) break;
      if (!this.isAscending && price < targetPrice) break;

      const level = this.levels.get(price);
      if (level) total += level.totalQuantity;
    }
    return total;
  }

  // Remove a price level completely
  removeLevel(price: number): void {
    this.levels.delete(price);
    this.sortedPrices = this.sortedPrices.filter((p) => p !== price);
  }

  private insertSorted(price: number): void {
    let insertIndex = 0;

    for (let i = 0; i < this.sortedPrices.length; i++) {
      const currentPrice = this.sortedPrices[i];

      if (this.isAscending) {
        if (price < currentPrice) break;
      } else {
        if (price > currentPrice) break;
      }
      insertIndex = i + 1;
    }

    this.sortedPrices.splice(insertIndex, 0, price);
  }
}

interface PriceLevel {
  price: number;
  totalQuantity: number;
  orderCount: number;
  orderIds: string[];
}
