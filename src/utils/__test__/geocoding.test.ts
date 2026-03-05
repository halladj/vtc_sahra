import axios from 'axios';
import { reverseGeocode } from '../geocoding';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('geocoding utility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return a formatted address on success', async () => {
        const mockResponse = {
            data: {
                display_name: '123 Test St, Test City, Test Country'
            }
        };
        mockedAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await reverseGeocode(36.7538, 3.0588);

        expect(result).toBe('123 Test St, Test City, Test Country');
        expect(mockedAxios.get).toHaveBeenCalledWith(
            'https://nominatim.openstreetmap.org/reverse',
            expect.objectContaining({
                params: {
                    lat: 36.7538,
                    lon: 3.0588,
                    format: 'jsonv2'
                }
            })
        );
    });

    it('should return null if display_name is missing', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: {} });

        const result = await reverseGeocode(36.7538, 3.0588);

        expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

        const result = await reverseGeocode(36.7538, 3.0588);

        expect(result).toBeNull();
    });
});
