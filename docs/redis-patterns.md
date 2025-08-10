# Redis Queue and PubSub Patterns for Trading Exchange

## Queue Names

- `orders:new` - New orders from API server to engine
- `orders:updates` - Order status updates from engine
- `trades:new` - New trades from engine
- `balances:updates` - Balance changes from trades
- `market:data` - Market data updates

## PubSub Channels

- `market:BTCUSD:trades` - Trade updates for specific pair
- `market:BTCUSD:orderbook` - Orderbook updates for specific pair
- `market:BTCUSD:ticker` - 24h ticker data
- `user:{userId}:orders` - User-specific order updates
- `user:{userId}:balances` - User-specific balance updates
- `system:status` - System-wide announcements

## Message Formats

### Order Message (Queue: orders:new)

```json
{
  "type": "NEW_ORDER",
  "orderId": "uuid-here",
  "userId": 123,
  "tradingPair": "BTCUSD",
  "side": "buy",
  "orderType": "limit",
  "price": 50000.0,
  "quantity": 0.1,
  "timeInForce": "GTC",
  "timestamp": "2025-08-10T12:00:00Z"
}
```

### Trade Message (Queue: trades:new)

```json
{
  "type": "TRADE_EXECUTED",
  "tradeId": "uuid-here",
  "tradingPair": "BTCUSD",
  "buyerOrderId": "uuid-buyer",
  "sellerOrderId": "uuid-seller",
  "buyerUserId": 123,
  "sellerUserId": 456,
  "price": 50000.0,
  "quantity": 0.05,
  "timestamp": "2025-08-10T12:00:01Z"
}
```

### Balance Update Message (Queue: balances:updates)

```json
{
  "type": "BALANCE_UPDATE",
  "userId": 123,
  "asset": "BTC",
  "changeAmount": -0.05,
  "balanceAfter": 1.95,
  "changeType": "trade",
  "referenceId": "trade-uuid",
  "timestamp": "2025-08-10T12:00:01Z"
}
```

### Orderbook Update (PubSub: market:BTCUSD:orderbook)

```json
{
  "type": "ORDERBOOK_UPDATE",
  "tradingPair": "BTCUSD",
  "bids": [
    { "price": 49999.0, "quantity": 0.5 },
    { "price": 49998.0, "quantity": 1.2 }
  ],
  "asks": [
    { "price": 50001.0, "quantity": 0.3 },
    { "price": 50002.0, "quantity": 0.8 }
  ],
  "timestamp": "2025-08-10T12:00:01Z"
}
```

## Redis Configuration for High Performance

```conf
# Append-only file for persistence
appendonly yes
appendfsync everysec

# Memory optimization
maxmemory 2gb
maxmemory-policy allkeys-lru

# Pub/Sub settings
client-output-buffer-limit pubsub 32mb 8mb 60

# Performance tuning
tcp-keepalive 300
timeout 0
```
