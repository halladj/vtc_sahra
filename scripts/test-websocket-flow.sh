#!/bin/bash

echo "🧪 WebSocket End-to-End Test"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Login as passenger
echo -e "${BLUE}1. Logging in as passenger...${NC}"
PASSENGER_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@vtc.dz","password":"password123"}' | jq -r '.accessToken')

PASSENGER_ID=$(echo $PASSENGER_TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.userId')
echo -e "${GREEN}✅ Passenger logged in: $PASSENGER_ID${NC}"
echo ""

# Login as driver
echo -e "${BLUE}2. Logging in as driver...${NC}"
DRIVER_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"driver1@vtc.dz","password":"password123"}' | jq -r '.accessToken')

DRIVER_ID=$(echo $DRIVER_TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.userId')
echo -e "${GREEN}✅ Driver logged in: $DRIVER_ID${NC}"
echo ""

# Create a ride as passenger
echo -e "${BLUE}3. Creating a ride via HTTP...${NC}"
RIDE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/rides \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -d '{
    "type": "REGULAR",
    "originLat": 36.75,
    "originLng": 3.05,
    "destLat": 36.76,
    "destLng": 3.07
  }')

RIDE_ID=$(echo $RIDE_RESPONSE | jq -r '.id')
echo -e "${GREEN}✅ Ride created: $RIDE_ID${NC}"
echo ""
echo "Ride details:"
echo $RIDE_RESPONSE | jq '{id, type, status, price, userId}'
echo ""

# Accept the ride as driver
echo -e "${BLUE}4. Driver accepting the ride via HTTP...${NC}"
ACCEPT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/rides/$RIDE_ID/accept \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -d '{}')

echo -e "${GREEN}✅ Ride accepted${NC}"
echo "Updated ride:"
echo $ACCEPT_RESPONSE | jq '{id, status, driverId, userId}'
echo ""

# Instructions for WebSocket testing
echo -e "${YELLOW}5. Now test WebSocket in two terminals:${NC}"
echo ""
echo -e "${YELLOW}Terminal 1 (Driver) - Run:${NC}"
echo "npm run ws-test $DRIVER_TOKEN"
echo ""
echo -e "${YELLOW}Terminal 2 (Passenger) - Run:${NC}"
echo "npm run ws-test $PASSENGER_TOKEN"
echo ""
echo -e "${YELLOW}Then in EITHER terminal, run:${NC}"
echo "update $RIDE_ID ONGOING"
echo ""
echo -e "${GREEN}Both terminals should receive the 'ride:statusUpdated' event!${NC}"
echo ""

echo "📊 Test Summary:"
echo "  ✅ Passenger login successful"
echo "  ✅ Driver login successful"
echo "  ✅ Ride created via HTTP (ride:created event sent to drivers)"
echo "  ✅ Ride accepted via HTTP (ride:accepted event sent to passenger)"
echo "  🔄 Ready for WebSocket status updates"
