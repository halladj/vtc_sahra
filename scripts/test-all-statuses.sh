#!/bin/bash

echo "🧪 Complete Ride Status Flow Test"
echo "=================================="
echo ""

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Login
echo -e "${BLUE}1. Setting up test accounts...${NC}"
PASSENGER_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@vtc.dz","password":"password123"}' | jq -r '.accessToken')

DRIVER_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"driver1@vtc.dz","password":"password123"}' | jq -r '.accessToken')

echo -e "${GREEN}✅ Logged in as passenger and driver${NC}"
echo ""

# Create ride
echo -e "${BLUE}2. Creating test ride...${NC}"
RIDE_ID=$(curl -s -X POST http://localhost:3000/api/v1/rides \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -d '{
    "type": "REGULAR",
    "originLat": 36.75,
    "originLng": 3.05,
    "destLat": 36.76,
    "destLng": 3.07
  }' | jq -r '.id')

echo -e "${GREEN}✅ Ride created: $RIDE_ID${NC}"
echo ""

# Accept ride
echo -e "${BLUE}3. Driver accepting ride...${NC}"
curl -s -X POST http://localhost:3000/api/v1/rides/$RIDE_ID/accept \
  -H "Authorization: Bearer $DRIVER_TOKEN" > /dev/null
echo -e "${GREEN}✅ Ride accepted (Status: ACCEPTED)${NC}"
echo ""

echo -e "${YELLOW}================================================${NC}"
echo -e "${YELLOW}Now test ALL status transitions via WebSocket:${NC}"
echo -e "${YELLOW}================================================${NC}"
echo ""

echo -e "${BLUE}Open WebSocket CLI:${NC}"
echo "npm run ws-test $PASSENGER_TOKEN"
echo ""

echo -e "${YELLOW}Test these commands in order:${NC}"
echo ""

echo "1️⃣  ${GREEN}Start ride (ACCEPTED → ONGOING):${NC}"
echo "   update $RIDE_ID ONGOING"
echo "   ${BLUE}→ Both driver & passenger receive 'ride:statusUpdated'${NC}"
echo ""

echo "2️⃣  ${GREEN}Complete ride (ONGOING → COMPLETED):${NC}"
echo "   update $RIDE_ID COMPLETED"
echo "   ${BLUE}→ Both receive 'ride:statusUpdated'${NC}"
echo "   ${BLUE}→ Driver charged 10% commission${NC}"
echo ""

echo "   ${RED}OR${NC}"
echo ""

echo "3️⃣  ${RED}Cancel ride (any status → CANCELLED):${NC}"
echo "   update $RIDE_ID CANCELLED"
echo "   ${BLUE}→ Both receive 'ride:cancelled' event${NC}"
echo "   ${BLUE}→ If driver cancels ACCEPTED/ONGOING: 5% penalty${NC}"
echo ""

echo -e "${YELLOW}================================================${NC}"
echo ""

echo "📋 All supported status transitions:"
echo "  • PENDING    → ACCEPTED   (via HTTP accept endpoint)"
echo "  • ACCEPTED   → ONGOING    (via WebSocket)"
echo "  • ONGOING    → COMPLETED  (via WebSocket)"
echo "  • Any status → CANCELLED  (via WebSocket)"
echo ""

echo "🎯 Events you'll see:"
echo "  • ride:statusUpdated - For ONGOING/COMPLETED"
echo "  • ride:cancelled     - For CANCELLED"
echo ""

echo "💰 Automatic charges:"
echo "  • COMPLETED: Driver pays 10% commission"
echo "  • CANCELLED by driver (when ACCEPTED/ONGOING): 5% penalty"
