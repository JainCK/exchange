-- TimescaleDB Schema for Trading Exchange

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- User balances
CREATE TABLE user_balances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    asset VARCHAR(10) NOT NULL,
    available_balance DECIMAL(20, 8) DEFAULT 0,
    locked_balance DECIMAL(20, 8) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, asset)
);

-- Trading pairs
CREATE TABLE trading_pairs (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL, -- e.g., 'BTCUSD'
    base_asset VARCHAR(10) NOT NULL,    -- e.g., 'BTC'
    quote_asset VARCHAR(10) NOT NULL,   -- e.g., 'USD'
    min_order_size DECIMAL(20, 8),
    max_order_size DECIMAL(20, 8),
    price_precision INTEGER DEFAULT 2,
    quantity_precision INTEGER DEFAULT 8,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    trading_pair_id INTEGER REFERENCES trading_pairs(id),
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('market', 'limit')),
    time_in_force VARCHAR(3) DEFAULT 'GTC' CHECK (time_in_force IN ('GTC', 'IOC', 'FOK')),
    price DECIMAL(20, 8),
    quantity DECIMAL(20, 8) NOT NULL,
    filled_quantity DECIMAL(20, 8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'filled', 'cancelled', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    filled_at TIMESTAMPTZ
);

-- Convert orders table to hypertable for time-series optimization
SELECT create_hypertable('orders', 'created_at');

-- Trades table
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trading_pair_id INTEGER REFERENCES trading_pairs(id),
    buyer_order_id UUID REFERENCES orders(id),
    seller_order_id UUID REFERENCES orders(id),
    buyer_user_id INTEGER REFERENCES users(id),
    seller_user_id INTEGER REFERENCES users(id),
    price DECIMAL(20, 8) NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL,
    buyer_fee DECIMAL(20, 8) DEFAULT 0,
    seller_fee DECIMAL(20, 8) DEFAULT 0,
    trade_time TIMESTAMPTZ DEFAULT NOW()
);

-- Convert trades table to hypertable
SELECT create_hypertable('trades', 'trade_time');

-- OHLCV candles table for different timeframes
CREATE TABLE ohlcv_1m (
    trading_pair_id INTEGER REFERENCES trading_pairs(id),
    open_time TIMESTAMPTZ NOT NULL,
    open_price DECIMAL(20, 8),
    high_price DECIMAL(20, 8),
    low_price DECIMAL(20, 8),
    close_price DECIMAL(20, 8),
    volume DECIMAL(20, 8),
    quote_volume DECIMAL(20, 8),
    trade_count INTEGER DEFAULT 0,
    PRIMARY KEY (trading_pair_id, open_time)
);

SELECT create_hypertable('ohlcv_1m', 'open_time');

-- Create other timeframe tables
CREATE TABLE ohlcv_5m () INHERITS (ohlcv_1m);
CREATE TABLE ohlcv_15m () INHERITS (ohlcv_1m);
CREATE TABLE ohlcv_1h () INHERITS (ohlcv_1m);
CREATE TABLE ohlcv_4h () INHERITS (ohlcv_1m);
CREATE TABLE ohlcv_1d () INHERITS (ohlcv_1m);

SELECT create_hypertable('ohlcv_5m', 'open_time');
SELECT create_hypertable('ohlcv_15m', 'open_time');
SELECT create_hypertable('ohlcv_1h', 'open_time');
SELECT create_hypertable('ohlcv_4h', 'open_time');
SELECT create_hypertable('ohlcv_1d', 'open_time');

-- Balance history for audit trail
CREATE TABLE balance_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    asset VARCHAR(10) NOT NULL,
    change_amount DECIMAL(20, 8) NOT NULL,
    balance_after DECIMAL(20, 8) NOT NULL,
    change_type VARCHAR(20) NOT NULL, -- 'trade', 'deposit', 'withdrawal', 'fee'
    reference_id UUID, -- Can reference trade_id, order_id, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('balance_history', 'created_at');

-- Market data for real-time feeds
CREATE TABLE market_data (
    trading_pair_id INTEGER REFERENCES trading_pairs(id),
    price DECIMAL(20, 8) NOT NULL,
    volume_24h DECIMAL(20, 8),
    price_change_24h DECIMAL(20, 8),
    high_24h DECIMAL(20, 8),
    low_24h DECIMAL(20, 8),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (trading_pair_id, timestamp)
);

SELECT create_hypertable('market_data', 'timestamp');

-- Indexes for better performance
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_trading_pair ON orders(trading_pair_id);
CREATE INDEX idx_trades_trading_pair ON trades(trading_pair_id);
CREATE INDEX idx_trades_time ON trades(trade_time);
CREATE INDEX idx_user_balances_user_asset ON user_balances(user_id, asset);

-- Sample trading pairs
INSERT INTO trading_pairs (symbol, base_asset, quote_asset, min_order_size, max_order_size, price_precision, quantity_precision) VALUES
('BTCUSD', 'BTC', 'USD', 0.00001, 1000, 2, 8),
('ETHUSD', 'ETH', 'USD', 0.001, 10000, 2, 8),
('LTCUSD', 'LTC', 'USD', 0.01, 50000, 2, 8);

-- Continuous aggregates for OHLCV calculation
CREATE MATERIALIZED VIEW ohlcv_1m_continuous
WITH (timescaledb.continuous) AS
SELECT trading_pair_id,
       time_bucket('1 minute', trade_time) AS open_time,
       FIRST(price, trade_time) AS open_price,
       MAX(price) AS high_price,
       MIN(price) AS low_price,
       LAST(price, trade_time) AS close_price,
       SUM(quantity) AS volume,
       SUM(price * quantity) AS quote_volume,
       COUNT(*) AS trade_count
FROM trades
GROUP BY trading_pair_id, time_bucket('1 minute', trade_time);

-- Refresh policy for continuous aggregates
SELECT add_continuous_aggregate_policy('ohlcv_1m_continuous',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute');
