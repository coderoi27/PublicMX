<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class GooglePlacesClient
{
    private const FIELD_MASK = 'places.id,places.displayName,places.location,places.primaryType,places.primaryTypeDisplayName,places.types,places.googleMapsTypeLabel,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.businessStatus,places.currentOpeningHours,places.regularOpeningHours';

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly RequestStack $requestStack,
        private readonly ?string $googlePlacesApiKey,
    ) {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchNearby(float $lat, float $lng, int $radiusMeters = 1500, int $maxResultCount = 20): array
    {
        return $this->mergePlaces([
            $this->nearbyRequest($lat, $lng, $radiusMeters, $maxResultCount, 'DISTANCE'),
            $this->nearbyRequest($lat, $lng, $radiusMeters, $maxResultCount, 'POPULARITY'),
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchTextNearby(string $query, float $lat, float $lng, int $radiusMeters = 1500, int $pageSize = 10): array
    {
        if (empty($this->googlePlacesApiKey) || trim($query) === '') {
            return [];
        }

        try {
            $data = $this->requestPlaces('https://places.googleapis.com/v1/places:searchText', [
                'textQuery' => $query,
                'pageSize' => max(1, min(20, $pageSize)),
                'languageCode' => 'es-MX',
                'regionCode' => 'MX',
                'includedType' => 'restaurant',
                'locationBias' => [
                    'circle' => [
                        'center' => [
                            'latitude' => $lat,
                            'longitude' => $lng,
                        ],
                        'radius' => (float) $radiusMeters,
                    ],
                ],
            ]);

            return $data['places'] ?? [];
        } catch (TransportExceptionInterface|\Throwable) {
            return [];
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function nearbyRequest(float $lat, float $lng, int $radiusMeters, int $maxResultCount, string $rankPreference): array
    {
        if (empty($this->googlePlacesApiKey)) {
            return [];
        }

        try {
            $data = $this->requestPlaces('https://places.googleapis.com/v1/places:searchNearby', [
                'includedTypes' => ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'ice_cream_shop', 'fast_food_restaurant', 'pizza_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'coffee_shop', 'mexican_restaurant', 'seafood_restaurant', 'steak_house', 'sushi_restaurant'],
                'maxResultCount' => max(1, min(20, $maxResultCount)),
                'rankPreference' => $rankPreference,
                'languageCode' => 'es-MX',
                'regionCode' => 'MX',
                'locationRestriction' => [
                    'circle' => [
                        'center' => [
                            'latitude' => $lat,
                            'longitude' => $lng,
                        ],
                        'radius' => (float) $radiusMeters,
                    ],
                ],
            ]);

            return $data['places'] ?? [];
        } catch (TransportExceptionInterface|\Throwable) {
            return [];
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function requestPlaces(string $url, array $payload): array
    {
        $request = $this->requestStack->getCurrentRequest();
        $referer = $request ? $request->getSchemeAndHttpHost() . '/' : 'http://localhost:8000/';

        $response = $this->httpClient->request('POST', $url, [
            'headers' => [
                'X-Goog-Api-Key' => $this->googlePlacesApiKey,
                'X-Goog-FieldMask' => self::FIELD_MASK,
                'Referer' => $referer,
            ],
            'json' => $payload,
        ]);

        return $response->toArray(false);
    }

    /**
     * @param list<list<array<string, mixed>>> $placeGroups
     * @return list<array<string, mixed>>
     */
    private function mergePlaces(array $placeGroups): array
    {
        $places = [];
        foreach ($placeGroups as $group) {
            foreach ($group as $place) {
                $placeId = is_string($place['id'] ?? null) ? $place['id'] : md5(json_encode($place));
                $places[$placeId] = $place;
            }
        }

        return array_values($places);
    }
}
