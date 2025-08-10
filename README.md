# Enhanced Trading Exchange Orderbook Server

A professional-grade orderbook server for cryptocurrency trading with real-time WebSocket updates, Redis pub/sub, and support for multiple trading pairs.

## Features

### 🚀 Core Trading Engine

- **Multiple Trading Pairs**: BTC/USD, ETH/USD, LTC/USD
- **Order Types**: Market orders, Limit orders
- **Time in Force**: GTC (Good Till Cancel), IOC (Immediate or Cancel), FOK (Fill or Kill)
- **Efficient Data Structures**: Price-level trees for O(log n) operations
- **Real-time Matching**: Price-time priority matching engine

### 📡 Real-time Communication

- **WebSocket Server**: Live orderbook updates, trade feeds
- **Redis Pub/Sub**: Scalable message distribution
- **Event Streaming**: Order updates, trade executions, market data

### 🏗️ Architecture

- **TypeScript**: Type-safe development
- **Express.js**: RESTful API server
- **Redis**: Message queuing and pub/sub
- **TimescaleDB**: Time-series data storage
- **Docker**: Containerized deployment

## Quick Start

### Using Docker from WSL (Recommended)

1. **Open WSL and navigate to the project:**

   ```bash
   # From Windows, open WSL
   wsl

   # Navigate to your project (adjust path as needed)
   cd /exchange
   ```

2. **Start all services:**

   ```bash
   docker-compose up --build
   ```

3. **Services will be available at:**
   - HTTP API: `http://localhost:3000`
   - WebSocket: `ws://localhost:3001`
   - Redis: `localhost:6379`
   - TimescaleDB: `localhost:5432`

### Local Development

1. **Setup dependencies (from Windows PowerShell or WSL):**

   ```bash
   # Windows PowerShell
   .\setup.ps1

   # Or from WSL
   chmod +x setup.sh
   ./setup.sh

   # Or manually
   cd orderbook-server
   npm install
   npm run build
   ```

2. **Start Redis and TimescaleDB (from WSL):**

   ```bash
   docker-compose up redis timescaledb
   ```

3. **Start the orderbook server (from Windows or WSL):**
   ```bash
   # From orderbook-server directory
   npm run dev
   ```

## API Documentation

### REST Endpoints

#### Health Check

```http
GET /health
```

Returns service status and statistics.

#### Get Trading Pairs

```http
GET /api/v1/pairs
```

Returns all available trading pairs.

#### Get Orderbook

```http
GET /api/v1/orderbook/:symbol?depth=20
```

Returns orderbook snapshot for a trading pair.

**Example:**

```bash
curl "http://localhost:3000/api/v1/orderbook/BTCUSD?depth=10"
```

#### Submit Order

```http
POST /api/v1/order
Content-Type: application/json

{
  "tradingPair": "BTCUSD",
  "side": "buy",
  "orderType": "limit",
  "price": 50000,
  "quantity": 0.1,
  "timeInForce": "GTC",
  "userId": "user123"
}
```

**Order Types:**

- **Limit Order**: Requires `price`
- **Market Order**: Executes at best available price

**Time in Force:**

- **GTC**: Good Till Cancel (default)
- **IOC**: Immediate or Cancel
- **FOK**: Fill or Kill

#### Cancel Order

```http
DELETE /api/v1/order/:orderId
Content-Type: application/json

{
  "tradingPair": "BTCUSD"
}
```

#### Get Market Stats

```http
GET /api/v1/stats/:symbol?
```

Returns market statistics for one or all trading pairs.

#### Get Recent Trades

```http
GET /api/v1/trades/:symbol?limit=50
```

Returns recent trade history.

### WebSocket API

Connect to `ws://localhost:3001` for real-time updates.

#### Connection

```javascript
const ws = new WebSocket("ws://localhost:3001");

ws.onopen = () => {
  console.log("Connected to trading exchange");
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data);
};
```

#### Subscribe to Orderbook Updates

```javascript
ws.send(
  JSON.stringify({
    type: "subscribe",
    channel: "market:BTCUSD:orderbook",
  })
);
```

#### Subscribe to Trade Updates

```javascript
ws.send(
  JSON.stringify({
    type: "subscribe",
    channel: "market:BTCUSD:trades",
  })
);
```

#### Get Live Orderbook

```javascript
ws.send(
  JSON.stringify({
    type: "getOrderbook",
    tradingPair: "BTCUSD",
    depth: 20,
  })
);
```

#### Get Market Statistics

```javascript
ws.send(
  JSON.stringify({
    type: "getMarketStats",
    tradingPair: "BTCUSD", // Optional: omit for all pairs
  })
);
```

## Example Usage

### Submit a Buy Limit Order

```bash
curl -X POST http://localhost:3000/api/v1/order \
  -H "Content-Type: application/json" \
  -d '{
    "tradingPair": "BTCUSD",
    "side": "buy",
    "orderType": "limit",
    "price": 49000,
    "quantity": 0.05,
    "timeInForce": "GTC"
  }'
```

### Submit a Market Sell Order

```bash
curl -X POST http://localhost:3000/api/v1/order \
  -H "Content-Type: application/json" \
  -d '{
    "tradingPair": "ETHUSD",
    "side": "sell",
    "orderType": "market",
    "quantity": 1.0,
    "timeInForce": "IOC"
  }'
```

### Get BTCUSD Orderbook

```bash
curl "http://localhost:3000/api/v1/orderbook/BTCUSD?depth=5"
```

**Response:**

```json
{
  "tradingPair": "BTCUSD",
  "bids": [
    { "price": 49500, "quantity": 0.1, "orderCount": 1 },
    { "price": 49400, "quantity": 0.2, "orderCount": 1 }
  ],
  "asks": [
    { "price": 50500, "quantity": 0.1, "orderCount": 1 },
    { "price": 50600, "quantity": 0.2, "orderCount": 1 }
  ],
  "timestamp": "2025-08-10T12:00:00.000Z"
}
```

## Trading Pairs

The server supports these trading pairs by default:

| Symbol | Base | Quote | Min Size | Max Size | Price Precision | Quantity Precision |
| ------ | ---- | ----- | -------- | -------- | --------------- | ------------------ |
| BTCUSD | BTC  | USD   | 0.00001  | 1000     | 2               | 8                  |
| ETHUSD | ETH  | USD   | 0.001    | 10000    | 2               | 6                  |
| LTCUSD | LTC  | USD   | 0.01     | 50000    | 2               | 4                  |

## Sample Liquidity

The server initializes with sample liquidity for demonstration:

**BTCUSD:**

- Bids: 49500, 49400, 49300, 49200, 49100
- Asks: 50500, 50600, 50700, 50800, 50900

**ETHUSD:**

- Bids: 2980, 2970, 2960
- Asks: 3020, 3030, 3040

**LTCUSD:**

- Bids: 98, 97
- Asks: 102, 103

## WebSocket Message Types

### Incoming Messages

- `subscribe` - Subscribe to a channel
- `unsubscribe` - Unsubscribe from a channel
- `ping` - Heartbeat ping
- `getOrderbook` - Request orderbook snapshot
- `getMarketStats` - Request market statistics

### Outgoing Messages

- `connected` - Connection established
- `subscribed` - Subscription confirmed
- `orderbook` - Orderbook snapshot/update
- `trade` - Trade execution
- `marketStats` - Market statistics
- `pong` - Heartbeat response
- `error` - Error message

## Development

### Project Structure

```
orderbook-server/
├── src/
│   ├── data-structures/     # Efficient orderbook data structures
│   │   └── PriceLevelTree.ts
│   ├── orderbook/          # Core trading engine
│   │   ├── Orderbook.ts
│   │   └── OrderbookManager.ts
│   ├── redis/              # Redis pub/sub service
│   │   └── RedisService.ts
│   ├── websocket/          # WebSocket server
│   │   └── WebSocketServer.ts
│   ├── index.ts            # Main server
│   └── types.ts            # TypeScript definitions
├── Dockerfile
├── package.json
└── tsconfig.json
```

### Scripts

```bash
npm run build    # Build TypeScript
npm run start    # Start production server
npm run dev      # Start development server
npm run watch    # Start with auto-reload
```

### Environment Variables

```bash
HTTP_PORT=3000                    # HTTP server port
WS_PORT=3001                     # WebSocket server port
REDIS_URL=redis://localhost:6379 # Redis connection URL
```

## Performance

- **Order Matching**: O(log n) operations using price-level trees
- **WebSocket**: Efficient event broadcasting to subscribed clients
- **Redis**: High-performance message queuing and pub/sub
- **Memory**: Optimized data structures for minimal memory usage

## Monitoring

Access real-time statistics:

```bash
curl http://localhost:3000/health
```

Returns:

- Service status
- Redis connectivity
- WebSocket connections
- Active orderbooks

## Next Steps

This enhanced orderbook server provides a solid foundation for building a complete trading exchange. Future enhancements could include:

1. **User Authentication**: JWT-based authentication system
2. **Database Integration**: Persistent order and trade history
3. **Risk Management**: Position limits, margin trading
4. **Market Making**: Automated liquidity provision
5. **Advanced Orders**: Stop-loss, take-profit, trailing stops
6. **Frontend Interface**: React/Next.js trading dashboard

## License

This project is for educational and demonstration purposes.
