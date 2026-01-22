import { describe, it, expect } from '@jest/globals';
import { calculateDistance, isWithinRadius, estimateTravelTime } from '../distance';

describe('Distance Calculation Utilities', () => {
    describe('calculateDistance', () => {
        it('should calculate distance between two points correctly', () => {
            // Paris to London: ~344 km
            const distance = calculateDistance(
                48.8566, 2.3522,  // Paris
                51.5074, -0.1278  // London
            );

            expect(distance).toBeGreaterThan(340);
            expect(distance).toBeLessThan(350);
        });

        it('should return 0 for same location', () => {
            const distance = calculateDistance(
                36.7538, 3.0588,
                36.7538, 3.0588
            );

            expect(distance).toBe(0);
        });

        it('should calculate short distances accurately', () => {
            // Algiers: 1km distance
            const distance = calculateDistance(
                36.7538, 3.0588,  // Point A
                36.7628, 3.0588   // Point B (~1km north)
            );

            expect(distance).toBeGreaterThan(0.9);
            expect(distance).toBeLessThan(1.1);
        });

        it('should handle negative coordinates', () => {
            const distance = calculateDistance(
                -33.8688, 151.2093,  // Sydney
                -37.8136, 144.9631   // Melbourne
            );

            expect(distance).toBeGreaterThan(700);
            expect(distance).toBeLessThan(800);
        });
    });

    describe('isWithinRadius', () => {
        it('should return true when point is within radius', () => {
            const result = isWithinRadius(
                36.7538, 3.0588,  // Center
                36.7638, 3.0688,  // Point ~1.5km away
                5                  // 5km radius
            );

            expect(result).toBe(true);
        });

        it('should return false when point is outside radius', () => {
            const result = isWithinRadius(
                36.7538, 3.0588,  // Center
                36.8538, 3.1588,  // Point ~15km away
                10                 // 10km radius
            );

            expect(result).toBe(false);
        });

        it('should return true for exact boundary', () => {
            // Point exactly 10km away
            const distance = calculateDistance(36.7538, 3.0588, 36.8438, 3.0588);
            const result = isWithinRadius(
                36.7538, 3.0588,
                36.8438, 3.0588,
                distance
            );

            expect(result).toBe(true);
        });
    });

    describe('estimateTravelTime', () => {
        it('should calculate travel time with default speed (40 km/h)', () => {
            const time = estimateTravelTime(20); // 20km

            expect(time).toBe(30); // 30 minutes at 40 km/h
        });

        it('should calculate travel time with custom speed', () => {
            const time = estimateTravelTime(60, 60); // 60km at 60 km/h

            expect(time).toBe(60); // 60 minutes
        });

        it('should handle short distances', () => {
            const time = estimateTravelTime(5); // 5km

            expect(time).toBe(8); // ~7.5 rounded to 8 minutes
        });

        it('should round to nearest minute', () => {
            const time = estimateTravelTime(10, 40); // 10km at 40 km/h

            expect(time).toBe(15); // Exactly 15 minutes
        });
    });

    describe('Real-world scenarios', () => {
        it('should correctly identify drivers within 10km of pickup', () => {
            const pickupLocation = { lat: 36.7538, lng: 3.0588 };

            const driver1 = { lat: 36.7638, lng: 3.0688 }; // ~1.5km away
            const driver2 = { lat: 36.8038, lng: 3.1088 }; // ~7km away
            const driver3 = { lat: 36.8538, lng: 3.1588 }; // ~15km away

            expect(isWithinRadius(
                pickupLocation.lat, pickupLocation.lng,
                driver1.lat, driver1.lng,
                10
            )).toBe(true);

            expect(isWithinRadius(
                pickupLocation.lat, pickupLocation.lng,
                driver2.lat, driver2.lng,
                10
            )).toBe(true);

            expect(isWithinRadius(
                pickupLocation.lat, pickupLocation.lng,
                driver3.lat, driver3.lng,
                10
            )).toBe(false);
        });

        it('should calculate realistic ETAs for city driving', () => {
            // 5km at city speed (30 km/h during traffic)
            const eta = estimateTravelTime(5, 30);

            expect(eta).toBe(10); // 10 minutes
        });

        it('should calculate realistic ETAs for highway driving', () => {
            // 20km at highway speed (80 km/h)
            const eta = estimateTravelTime(20, 80);

            expect(eta).toBe(15); // 15 minutes
        });
    });

    describe('Edge cases', () => {
        it('should handle equator crossing', () => {
            const distance = calculateDistance(
                1, 0,   // Near equator
                -1, 0   // Other side of equator
            );

            expect(distance).toBeGreaterThan(200);
            expect(distance).toBeLessThan(250);
        });

        it('should handle date line crossing', () => {
            const distance = calculateDistance(
                0, 179,   // Near date line
                0, -179   // Other side
            );

            expect(distance).toBeGreaterThan(200);
            expect(distance).toBeLessThan(300);
        });

        it('should handle very small distances', () => {
            const distance = calculateDistance(
                36.7538, 3.0588,
                36.7539, 3.0589  // ~100m
            );

            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeLessThan(0.2);
        });
    });
});
