import { io } from 'socket.io-client';
import axios from 'axios';

// Configuration
const API_URL = 'http://localhost:3000/api/v1';
const WS_URL = 'http://localhost:3000';

// Test Data
const DRIVER_LOCATION = { latitude: 36.7538, longitude: 3.0588 }; // Algiers
const RIDE_ORIGIN = { latitude: 36.7550, longitude: 3.0600 };     // Nearby (~200m)

async function runTest() {
    console.log('🚀 Starting Broadcast Test...');

    try {
        // 1. Create & Login Driver
        console.log('\n👤 Creating Driver...');
        const driverEmail = `driver_${Date.now()}@test.com`;

        // Use JSON payload (backend should handle it if body-parser is configured)
        // If it fails with "Multipart: Boundary not found", we'll switch to FormData
        try {
            await axios.post(`${API_URL}/auth/register-driver`, {
                email: driverEmail,
                password: 'password123',
                firstName: 'Test',
                lastName: 'Driver',
                phoneNumber: `055${Date.now().toString().slice(-7)}`,
                sex: 'MALE',
                dateOfBirth: '1990-01-01T00:00:00.000Z',
                address: 'Algiers',
                wilaya: 'Algiers',
                commune: 'Algiers',
                vehicle: {
                    type: 'CAR',
                    model: 'Toyota Yaris',
                    year: 2020,
                    plate: `12345-${Date.now().toString().slice(-4)}`
                }
            });
        } catch (e: any) {
            // Ignore if email in use (unlikely with timestamp)
            if (e.response?.status !== 400) throw e;
        }

        const driverLogin = await axios.post(`${API_URL}/auth/login`, {
            email: driverEmail,
            password: 'password123'
        });
        const driverToken = driverLogin.data.accessToken; // Note: accessToken not token
        const driverId = driverLogin.data.accessToken ? JSON.parse(atob(driverLogin.data.accessToken.split('.')[1])).id : null;
        // Actually, let's look at the response structure in auth.routes.ts line 155
        // It returns { accessToken, refreshToken }
        // We need to decode the token to get the ID, or just trust the earlier logic?
        // Wait, the earlier logic used `driverLogin.data.user.id` but the login response (L190) only returns tokens!
        // We need to decode the token to get the ID.

        // Helper to decode JWT payload
        const getPayload = (token: string) => {
            const parts = token.split('.');
            if (parts.length < 2) throw new Error('Invalid token');
            return JSON.parse(Buffer.from(parts[1] as string, 'base64').toString());
        };
        const driverPayload = getPayload(driverToken);
        console.log('🔍 Decoded Driver Token:', driverPayload);
        const driverIdReal = driverPayload.id || driverPayload.userId || driverPayload.sub; // Try common fields


        console.log(`✅ Driver logged in: ${driverIdReal}`);

        // 2. Create & Login Passenger
        console.log('\n👤 Creating Passenger...');
        const userEmail = `user_${Date.now()}@test.com`;
        try {
            await axios.post(`${API_URL}/auth/register`, {
                email: userEmail,
                password: 'password123',
                firstName: 'Test',
                lastName: 'Passenger',
                phoneNumber: `066${Date.now().toString().slice(-7)}`,
                sex: 'MALE',
                dateOfBirth: '1995-01-01T00:00:00.000Z',
                address: 'Algiers',
                wilaya: 'Algiers',
                commune: 'Algiers'
            });
        } catch (e: any) {
            if (e.response?.status !== 400) throw e;
        }

        const userLogin = await axios.post(`${API_URL}/auth/login`, {
            email: userEmail,
            password: 'password123'
        });
        const userToken = userLogin.data.accessToken;
        const userPayload = getPayload(userToken);
        // const userId = userPayload.id;
        console.log('✅ Passenger logged in');

        // 3. Connect Driver Socket
        console.log('\n🔌 Connecting Driver Socket...');
        const driverSocket = io(WS_URL, {
            transports: ['websocket'],
            auth: { token: `Bearer ${driverToken}` }
        });

        await new Promise<void>((resolve) => {
            driverSocket.on('connect', () => {
                console.log('✅ Driver Connected');
                driverSocket.emit('authenticate', { userId: driverId, role: 'DRIVER' });
                resolve();
            });
        });

        // 4. Driver sends location (to be available)
        console.log('\n📍 Sending Driver Location...');
        driverSocket.emit('driver:locationUpdate', DRIVER_LOCATION);

        // Wait a bit for backend to process location
        await new Promise(r => setTimeout(r, 1000));

        // 5. Setup Driver Listeners
        const eventPromise = new Promise((resolve, reject) => {
            let rideCreatedRef: any = null;

            driverSocket.on('ride:created', (data) => {
                console.log('✨ RECEIVED ride:created');
                console.log(`   Distance: ${data.distance}km`);
                rideCreatedRef = data.ride;
            });

            driverSocket.on('ride:cancelled', (data) => {
                console.log('🚫 RECEIVED ride:cancelled');
                console.log(`   Reason: ${data.reason}`);

                if (rideCreatedRef && data.ride.id === rideCreatedRef.id) {
                    console.log('✅ SUCCESS: Driver received cancellation for the pending ride!');
                    resolve(true);
                } else {
                    reject(new Error('Received cancellation for wrong ride'));
                }
            });
        });

        // 6. Passenger creates ride
        console.log('\n🚗 Passenger creating ride...');
        const rideRes = await axios.post(`${API_URL}/rides`, {
            type: 'REGULAR',
            originLat: RIDE_ORIGIN.latitude,
            originLng: RIDE_ORIGIN.longitude,
            destLat: 36.7600,
            destLng: 3.0700,
            price: 500
        }, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        const rideId = rideRes.data.id;
        console.log(`✅ Ride created: ${rideId}`);

        // Wait a bit
        await new Promise(r => setTimeout(r, 2000));

        // 7. Passenger cancels ride
        console.log('\n❌ Passenger cancelling ride...');
        await axios.put(`${API_URL}/rides/${rideId}/cancel`, {}, {
            headers: { Authorization: `Bearer ${userToken}` }
        });

        // 8. Wait for test to complete
        await eventPromise;
        console.log('\n🎉 TEST PASSED SUCCESSFULLY!');
        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ TEST FAILED:', error.response?.data || error.message);
        process.exit(1);
    }
}

runTest();
