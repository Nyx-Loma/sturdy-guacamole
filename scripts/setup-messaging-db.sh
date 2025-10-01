#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🗄️  Setting up Messaging Database${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}❌ Docker is not running${NC}"
  echo "Please start Docker and try again"
  exit 1
fi

echo -e "${YELLOW}📦 Starting messaging database container...${NC}"
docker-compose -f docker-compose.dev.yml up -d messaging-db

echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
# Wait for postgres to be ready
until docker-compose -f docker-compose.dev.yml exec -T messaging-db pg_isready -U messaging > /dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo ""

echo -e "${YELLOW}📋 Applying database schema...${NC}"
# Apply schema
docker-compose -f docker-compose.dev.yml exec -T messaging-db psql -U messaging -d messaging < services/messaging/schema.sql

echo ""
echo -e "${GREEN}✅ Messaging database is ready!${NC}"
echo ""
echo -e "Connection details:"
echo -e "  ${YELLOW}URL:${NC} postgresql://messaging:messaging@localhost:5433/messaging"
echo -e "  ${YELLOW}Host:${NC} localhost"
echo -e "  ${YELLOW}Port:${NC} 5433"
echo -e "  ${YELLOW}Database:${NC} messaging"
echo -e "  ${YELLOW}User:${NC} messaging"
echo -e "  ${YELLOW}Password:${NC} messaging"
echo ""
echo -e "You can now run integration tests with: ${GREEN}pnpm test${NC}"

