import axios from 'axios';

/**
 * Perform a reverse geocoding lookup using OpenStreetMap's Nominatim API.
 * Nominatim requires a User-Agent header, otherwise it may block the request.
 * It's also rate-limited to 1 request per second.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: {
                lat,
                lon: lng,
                format: 'jsonv2'
            },
            headers: {
                'User-Agent': 'VtcAppBackend/1.0 (contact@vtc-sahra.com)' // Identify your app to Nominatim
            },
            timeout: 5000 // 5 second timeout so we don't hang requests forever
        });

        if (response.data && response.data.display_name) {
            return response.data.display_name;
        }

        return null;
    } catch (error) {
        console.error('Failed to reverse geocode:', error);
        return null;
    }
}
