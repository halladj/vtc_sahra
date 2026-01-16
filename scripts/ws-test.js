#!/usr/bin/env node

/**
 * WebSocket CLI Test Tool
 * Interactive command-line client for testing WebSocket ride events
 * 
 * Usage: npm run ws-test
 */

const io = require('socket.io-client');
const readline = require('readline');

const SERVER_URL = process.env.WS_URL || 'http://localhost:3000';

// Get JWT token from command line argument
const token = process.argv[2];

if (!token) {
    console.log('\n❌ Error: JWT token required');
    console.log('\nUsage:');
    console.log('  npm run ws-test <JWT_TOKEN>');
    console.log('\nExample:');
    console.log('  npm run ws-test eyJhbGciOiJIUzI1...');
    console.log('\nOr set environment variable:');
    console.log('  TOKEN=your-jwt npm run ws-test\n');
    process.exit(1);
}

// Create Socket.IO client
const socket = io(SERVER_URL, {
    auth: { token: `Bearer ${token}` },
    transports: ['websocket'],
});

// Create readline interface for interactive commands
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});

console.log('\n🔌 Connecting to WebSocket server...');
console.log(`📡 Server: ${SERVER_URL}\n`);

// Connection events
socket.on('connect', () => {
    console.log('✅ Connected to WebSocket server!');
    console.log(`🆔 Socket ID: ${socket.id}\n`);
    console.log('📝 Available commands:');
    console.log('  update <rideId> <status>  - Update ride status');
    console.log('  join <rideId>             - Join a ride room');
    console.log('  ping                      - Send heartbeat response');
    console.log('  help                      - Show this help');
    console.log('  exit                      - Disconnect and exit\n');
    rl.prompt();
});

socket.on('connect_error', (error) => {
    console.log(`\n❌ Connection Error: ${error.message}\n`);
    process.exit(1);
});

socket.on('disconnect', () => {
    console.log('\n🔌 Disconnected from server\n');
    process.exit(0);
});

// Ride events
socket.on('ride:created', (data) => {
    console.log('\n🆕 New Ride Created:');
    console.log(JSON.stringify(data, null, 2));
    rl.prompt();
});

socket.on('ride:accepted', (data) => {
    console.log('\n✅ Ride Accepted:');
    console.log(JSON.stringify(data, null, 2));
    rl.prompt();
});

socket.on('ride:statusUpdated', (data) => {
    console.log('\n🔄 Ride Status Updated:');
    console.log(JSON.stringify(data, null, 2));
    rl.prompt();
});

socket.on('ride:cancelled', (data) => {
    console.log('\n❌ Ride Cancelled:');
    console.log(JSON.stringify(data, null, 2));
    rl.prompt();
});

socket.on('ride:error', (data) => {
    console.log('\n⚠️  Error:');
    console.log(JSON.stringify(data, null, 2));
    rl.prompt();
});

socket.on('heartbeat', (data) => {
    console.log(`\n💓 Heartbeat received (${new Date(data.timestamp).toLocaleTimeString()})`);
    socket.emit('heartbeat:response');
    rl.prompt();
});

// Handle user input
rl.on('line', (line) => {
    const args = line.trim().split(' ');
    const command = args[0].toLowerCase();

    switch (command) {
        case 'update':
            if (args.length < 3) {
                console.log('❌ Usage: update <rideId> <status>');
                console.log('   Example: update ride-123 ONGOING');
            } else {
                const rideId = args[1];
                const status = args[2].toUpperCase();
                console.log(`\n⏳ Updating ride ${rideId} to ${status}...`);

                socket.emit('ride:updateStatus',
                    { rideId, status },
                    (ack) => {
                        if (ack.error) {
                            console.log(`❌ Error: ${ack.error}`);
                        } else {
                            console.log('✅ Success! Ride updated');
                        }
                        rl.prompt();
                    }
                );
                return; // Don't prompt yet, wait for ack
            }
            break;

        case 'join':
            if (args.length < 2) {
                console.log('❌ Usage: join <rideId>');
                console.log('   Example: join ride-123');
            } else {
                const rideId = args[1];
                console.log(`\n🚪 Joining ride room: ${rideId}`);
                socket.emit('ride:join', { rideId });
                console.log('✅ Joined ride room');
            }
            break;

        case 'ping':
            console.log('\n🏓 Pong!');
            socket.emit('heartbeat:response');
            break;

        case 'help':
            console.log('\n📝 Available commands:');
            console.log('  update <rideId> <status>  - Update ride status (PENDING, ACCEPTED, ONGOING, COMPLETED, CANCELLED)');
            console.log('  join <rideId>             - Join a ride room to receive updates');
            console.log('  ping                      - Send heartbeat response');
            console.log('  help                      - Show this help');
            console.log('  exit                      - Disconnect and exit\n');
            break;

        case 'exit':
        case 'quit':
            console.log('\n👋 Goodbye!\n');
            socket.disconnect();
            process.exit(0);
            break;

        case '':
            // Empty line, just reprompt
            break;

        default:
            console.log(`❌ Unknown command: ${command}`);
            console.log('   Type "help" for available commands');
    }

    rl.prompt();
});

rl.on('close', () => {
    console.log('\n👋 Goodbye!\n');
    socket.disconnect();
    process.exit(0);
});
