# Docker Commands for WSL

## Quick Reference for Running the Trading Exchange

### Start the Complete System

```bash
# From WSL, navigate to project directory
cd /mnt/j/Active\ Projects/exchange

# Start all services (Redis, TimescaleDB, Orderbook Server)
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### Development Workflow

```bash
# Start only infrastructure (Redis + TimescaleDB)
docker-compose up redis timescaledb

# Then run the orderbook server locally for development
cd orderbook-server
npm run dev
```

### Useful Docker Commands

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs orderbook-server
docker-compose logs redis
docker-compose logs timescaledb

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# Rebuild specific service
docker-compose build orderbook-server

# Execute commands inside containers
docker-compose exec redis redis-cli
docker-compose exec timescaledb psql -U exchange_user -d exchange_db
```

### Troubleshooting

```bash
# Check if Docker is running in WSL
docker --version
docker-compose --version

# Check available images
docker images

# Check container status
docker ps -a

# Remove stopped containers
docker container prune

# Remove unused images
docker image prune
```

### Environment Setup in WSL

If you haven't set up Docker in WSL yet:

```bash
# Install Docker in WSL2 (Ubuntu/Debian)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Restart WSL or logout/login
```

### Access URLs

- **API Endpoint**: `http://localhost:3000`
- **WebSocket**: `ws://localhost:3001`
- **Redis CLI**: `docker-compose exec redis redis-cli`
- **Database**: `docker-compose exec timescaledb psql -U exchange_user -d exchange_db`
