import { RideStatus } from "@prisma/client";
import { db } from "../../../utils/db";
import {
    createRating,
    getRatingByRideId,
    getDriverRatings,
    getDriverAverageRating,
    validateRating,
} from "../rating.services";

// Mock the database
jest.mock("../../../utils/db", () => ({
    db: {
        ride: {
            findUnique: jest.fn(),
        },
        rating: {
            create: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
    },
}));

describe("Rating Services", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("createRating", () => {
        it("should create a rating for a completed ride", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.COMPLETED,
            };

            const mockRating = {
                id: "rating-123",
                rideId: "ride-123",
                fromId: "passenger-123",
                toId: "driver-123",
                score: 5,
                comment: "Great ride!",
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(null);
            (db.rating.create as jest.Mock).mockResolvedValue(mockRating);

            const result = await createRating(
                "ride-123",
                "passenger-123",
                5,
                "Great ride!"
            );

            expect(result.score).toBe(5);
            expect(result.comment).toBe("Great ride!");
            expect(db.rating.create).toHaveBeenCalledWith({
                data: {
                    rideId: "ride-123",
                    fromId: "passenger-123",
                    toId: "driver-123",
                    score: 5,
                    comment: "Great ride!",
                },
                include: expect.any(Object),
            });
        });

        it("should throw error if ride not found", async () => {
            (db.ride.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(
                createRating("ride-123", "passenger-123", 5)
            ).rejects.toThrow("Ride not found");
        });

        it("should throw error if ride is not completed", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.ONGOING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            await expect(
                createRating("ride-123", "passenger-123", 5)
            ).rejects.toThrow("Can only rate completed rides");
        });

        it("should throw error if ride has no driver", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: null,
                status: RideStatus.COMPLETED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            await expect(
                createRating("ride-123", "passenger-123", 5)
            ).rejects.toThrow("Ride has no driver to rate");
        });

        it("should throw error if user is not the passenger", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.COMPLETED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            await expect(
                createRating("ride-123", "wrong-user", 5)
            ).rejects.toThrow("Only the passenger can rate the ride");
        });

        it("should throw error if ride already rated", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.COMPLETED,
            };

            const existingRating = {
                id: "rating-123",
                rideId: "ride-123",
                fromId: "passenger-123",
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(existingRating);

            await expect(
                createRating("ride-123", "passenger-123", 5)
            ).rejects.toThrow("Ride already rated");
        });

        it("should throw error for invalid rating score (too low)", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.COMPLETED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(
                createRating("ride-123", "passenger-123", 0)
            ).rejects.toThrow("Rating must be between 1 and 5");
        });

        it("should throw error for invalid rating score (too high)", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.COMPLETED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(
                createRating("ride-123", "passenger-123", 6)
            ).rejects.toThrow("Rating must be between 1 and 5");
        });

        it("should throw error for comment exceeding 500 characters", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.COMPLETED,
            };

            const longComment = "a".repeat(501);

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(
                createRating("ride-123", "passenger-123", 5, longComment)
            ).rejects.toThrow("Comment must be 500 characters or less");
        });

        it("should create rating without comment", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.COMPLETED,
            };

            const mockRating = {
                id: "rating-123",
                rideId: "ride-123",
                fromId: "passenger-123",
                toId: "driver-123",
                score: 4,
                comment: null,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(null);
            (db.rating.create as jest.Mock).mockResolvedValue(mockRating);

            const result = await createRating("ride-123", "passenger-123", 4);

            expect(result.score).toBe(4);
            expect(result.comment).toBeNull();
        });
    });

    describe("getRatingByRideId", () => {
        it("should return rating for a ride", async () => {
            const mockRating = {
                id: "rating-123",
                rideId: "ride-123",
                score: 5,
                comment: "Excellent!",
            };

            (db.rating.findFirst as jest.Mock).mockResolvedValue(mockRating);

            const result = await getRatingByRideId("ride-123");

            expect(result).toEqual(mockRating);
            expect(db.rating.findFirst).toHaveBeenCalledWith({
                where: { rideId: "ride-123" },
                include: expect.any(Object),
            });
        });

        it("should return null if no rating found", async () => {
            (db.rating.findFirst as jest.Mock).mockResolvedValue(null);

            const result = await getRatingByRideId("ride-123");

            expect(result).toBeNull();
        });
    });

    describe("getDriverRatings", () => {
        it("should return all ratings for a driver", async () => {
            const mockRatings = [
                { id: "rating-1", toId: "driver-123", score: 5 },
                { id: "rating-2", toId: "driver-123", score: 4 },
            ];

            (db.rating.findMany as jest.Mock).mockResolvedValue(mockRatings);

            const result = await getDriverRatings("driver-123");

            expect(result).toEqual(mockRatings);
            expect(db.rating.findMany).toHaveBeenCalledWith({
                where: { toId: "driver-123" },
                include: expect.any(Object),
                orderBy: { id: "desc" },
            });
        });

        it("should return empty array if driver has no ratings", async () => {
            (db.rating.findMany as jest.Mock).mockResolvedValue([]);

            const result = await getDriverRatings("driver-123");

            expect(result).toEqual([]);
        });
    });

    describe("getDriverAverageRating", () => {
        it("should calculate average rating correctly", async () => {
            const mockRatings = [
                { score: 5 },
                { score: 4 },
                { score: 5 },
                { score: 3 },
            ];

            (db.rating.findMany as jest.Mock).mockResolvedValue(mockRatings);

            const result = await getDriverAverageRating("driver-123");

            expect(result.average).toBe(4.3); // (5+4+5+3)/4 = 4.25 rounded to 4.3
            expect(result.count).toBe(4);
        });

        it("should return 0 average for driver with no ratings", async () => {
            (db.rating.findMany as jest.Mock).mockResolvedValue([]);

            const result = await getDriverAverageRating("driver-123");

            expect(result.average).toBe(0);
            expect(result.count).toBe(0);
        });

        it("should round average to 1 decimal place", async () => {
            const mockRatings = [{ score: 4 }, { score: 5 }, { score: 4 }];

            (db.rating.findMany as jest.Mock).mockResolvedValue(mockRatings);

            const result = await getDriverAverageRating("driver-123");

            expect(result.average).toBe(4.3); // (4+5+4)/3 = 4.333... rounded to 4.3
        });
    });

    describe("validateRating", () => {
        it("should return valid for valid rating", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                status: RideStatus.COMPLETED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(null);

            const result = await validateRating("ride-123", "passenger-123");

            expect(result.valid).toBe(true);
        });

        it("should return invalid if ride not found", async () => {
            (db.ride.findUnique as jest.Mock).mockResolvedValue(null);

            const result = await validateRating("ride-123", "passenger-123");

            expect(result.valid).toBe(false);
            expect(result.message).toBe("Ride not found");
        });

        it("should return invalid if ride not completed", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                status: RideStatus.ONGOING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            const result = await validateRating("ride-123", "passenger-123");

            expect(result.valid).toBe(false);
            expect(result.message).toBe("Can only rate completed rides");
        });

        it("should return invalid if user is not passenger", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                status: RideStatus.COMPLETED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            const result = await validateRating("ride-123", "wrong-user");

            expect(result.valid).toBe(false);
            expect(result.message).toBe("Only the passenger can rate the ride");
        });

        it("should return invalid if already rated", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                status: RideStatus.COMPLETED,
            };

            const existingRating = { id: "rating-123" };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.rating.findFirst as jest.Mock).mockResolvedValue(existingRating);

            const result = await validateRating("ride-123", "passenger-123");

            expect(result.valid).toBe(false);
            expect(result.message).toBe("Ride already rated");
        });
    });
});
