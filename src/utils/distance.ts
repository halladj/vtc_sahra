/**
 * Distance calculation utilities using Haversine formula
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 Latitude of point 1
 * @param lng1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lng2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371; // Earth's radius in kilometers

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in km
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Check if a location is within a certain radius of another location
 * @param centerLat Center point latitude
 * @param centerLng Center point longitude
 * @param pointLat Point to check latitude
 * @param pointLng Point to check longitude
 * @param radiusKm Radius in kilometers
 * @returns true if point is within radius
 */
export function isWithinRadius(
    centerLat: number,
    centerLng: number,
    pointLat: number,
    pointLng: number,
    radiusKm: number
): boolean {
    const distance = calculateDistance(centerLat, centerLng, pointLat, pointLng);
    return distance <= radiusKm;
}

/**
 * Calculate estimated travel time based on distance and average speed
 * @param distanceKm Distance in kilometers
 * @param avgSpeedKmh Average speed in km/h (default: 40 km/h for city driving)
 * @returns Estimated time in minutes
 */
export function estimateTravelTime(
    distanceKm: number,
    avgSpeedKmh: number = 40
): number {
    const timeHours = distanceKm / avgSpeedKmh;
    return Math.round(timeHours * 60); // Convert to minutes
}
