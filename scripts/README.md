# WebSocket CLI Test Tool

Interactive command-line tool for testing WebSocket connections and ride events.

## Prerequisites

1. **Server running**: `npm run dev`
2. **JWT token**: Get from login endpoint

## Quick Start

### 1. Get a JWT Token

Login via HTTP to get a token:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@example.com","password":"your-password"}'
```

Copy the `accessToken` from the response.

### 2. Run the CLI Tool

```bash
npm run ws-test YOUR_JWT_TOKEN_HERE
```

Example:
```bash
npm run ws-test eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Available Commands

Once connected, you can use these commands:

### Update Ride Status
```
update <rideId> <status>
```
Example:
```
update ride-123 ONGOING
```

Valid statuses: `PENDING`, `ACCEPTED`, `ONGOING`, `COMPLETED`, `CANCELLED`

### Join a Ride Room
```
join <rideId>
```
Example:
```
join ride-123
```

### Send Heartbeat
```
ping
```

### Show Help
```
help
```

### Exit
```
exit
```

## Events You'll Receive

The CLI automatically displays all incoming events:

- 🆕 **ride:created** - New ride available (drivers only)
- ✅ **ride:accepted** - Ride accepted
- 🔄 **ride:statusUpdated** - Status changed
- ❌ **ride:cancelled** - Ride cancelled
- 💓 **heartbeat** - Server heartbeat (every 30s)

## Example Session

```bash
$ npm run ws-test eyJhbGc...

🔌 Connecting to WebSocket server...
📡 Server: http://localhost:3000

✅ Connected to WebSocket server!
🆔 Socket ID: abc123

📝 Available commands:
  update <rideId> <status>  - Update ride status
  join <rideId>             - Join a ride room
  ping                      - Send heartbeat response
  help                      - Show this help
  exit                      - Disconnect and exit

> join ride-abc-123

🚪 Joining ride room: ride-abc-123
✅ Joined ride room

> update ride-abc-123 ONGOING

⏳ Updating ride ride-abc-123 to ONGOING...
✅ Success! Ride updated

🔄 Ride Status Updated:
{
  "ride": {
    "id": "ride-abc-123",
    "status": "ONGOING",
    ...
  }
}

> exit

👋 Goodbye!
```

## Testing Multiple Connections

Open multiple terminals to test driver/passenger interactions:

**Terminal 1 (Driver):**
```bash
npm run ws-test DRIVER_TOKEN
```

**Terminal 2 (Passenger):**
```bash
npm run ws-test PASSENGER_TOKEN
```

Now you can see real-time events between both connections!

## Troubleshooting

**Connection Error:**
- Make sure server is running (`npm run dev`)
- Check token is valid (not expired)
- Token should be complete JWT string

**No Events Received:**
- Make sure you joined the correct room
- Drivers auto-join "drivers" room
- Passengers need to join specific ride rooms
