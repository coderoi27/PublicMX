<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class GooglePlacesClient
{
    private const BASE_FIELD_MASK = [
        'places.id',
        'places.displayName',
        'places.location',
        'places.primaryType',
        'places.primaryTypeDisplayName',
        'places.types',
        'places.googleMapsTypeLabel',
        'places.formattedAddress',
        'places.businessStatus',
    ];

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly RequestStack $requestStack,
        private readonly CacheInterface $cache,
        private readonly ?string $googlePlacesApiKey,
    ) {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchNearby(float $lat, float $lng, int $radiusMeters = 1000, int $maxResultCount = 20, array $fieldOptions = []): array
    {
        return $this->mergePlaces([
            $this->nearbyRequest($lat, $lng, $radiusMeters, $maxResultCount, 'DISTANCE', $fieldOptions),
            $this->nearbyRequest($lat, $lng, $radiusMeters, $maxResultCount, 'POPULARITY', $fieldOptions),
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchTextNearby(string $query, float $lat, float $lng, int $radiusMeters = 1000, int $pageSize = 10, array $fieldOptions = []): array
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
            ], $fieldOptions);

            return $data['places'] ?? [];
        } catch (TransportExceptionInterface|\Throwable) {
            return [];
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function fetchPlace(string $placeId, array $fieldOptions = []): ?array
    {
        if (empty($this->googlePlacesApiKey) || trim($placeId) === '') {
            return null;
        }

        $request = $this->requestStack->getCurrentRequest();
        $referer = $request ? $request->getSchemeAndHttpHost() . '/' : 'http://localhost:8000/';

        $fieldMask = $this->placeDetailsFieldMask($fieldOptions);
        $cacheKey = 'public_google_place_details_' . md5($placeId . '|' . $fieldMask);

        try {
            return $this->cache->get($cacheKey, function (ItemInterface $item) use ($placeId, $fieldMask, $referer): ?array {
                $item->expiresAfter(600);

                $response = $this->httpClient->request('GET', sprintf('https://places.googleapis.com/v1/places/%s', rawurlencode($placeId)), [
                    'headers' => [
                        'X-Goog-Api-Key' => $this->googlePlacesApiKey,
                        'X-Goog-FieldMask' => $fieldMask,
                        'Referer' => $referer,
                    ],
                ]);

                /** @var array<string, mixed> $payload */
                $payload = $response->toArray(false);

                return $payload !== [] ? $payload : null;
            });
        } catch (TransportExceptionInterface|\Throwable) {
            return null;
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function nearbyRequest(float $lat, float $lng, int $radiusMeters, int $maxResultCount, string $rankPreference, array $fieldOptions): array
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
            ], $fieldOptions);

            return $data['places'] ?? [];
        } catch (TransportExceptionInterface|\Throwable) {
            return [];
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function requestPlaces(string $url, array $payload, array $fieldOptions): array
    {
        $request = $this->requestStack->getCurrentRequest();
        $referer = $request ? $request->getSchemeAndHttpHost() . '/' : 'http://localhost:8000/';

        $response = $this->httpClient->request('POST', $url, [
            'headers' => [
                'X-Goog-Api-Key' => $this->googlePlacesApiKey,
                'X-Goog-FieldMask' => $this->fieldMask($fieldOptions),
                'Referer' => $referer,
            ],
            'json' => $payload,
        ]);

        return $response->toArray(false);
    }

    /**
     * @param array<string, mixed> $fieldOptions
     */
    private function fieldMask(array $fieldOptions): string
    {
        $fields = self::BASE_FIELD_MASK;

        if (($fieldOptions['include_photos'] ?? true) === true) {
            $fields[] = 'places.photos';
        }

        if (($fieldOptions['include_ratings'] ?? true) === true) {
            $fields[] = 'places.rating';
            $fields[] = 'places.userRatingCount';
        }

        if (($fieldOptions['include_opening_hours'] ?? true) === true) {
            $fields[] = 'places.currentOpeningHours';
            $fields[] = 'places.regularOpeningHours';
        }

        if (($fieldOptions['include_service_attributes'] ?? true) === true) {
            $fields[] = 'places.delivery';
            $fields[] = 'places.takeout';
            $fields[] = 'places.dineIn';
        }

        return implode(',', array_values(array_unique($fields)));
    }

    /**
     * @param array<string, mixed> $fieldOptions
     */
    private function placeDetailsFieldMask(array $fieldOptions): string
    {
        return implode(',', array_map(
            static fn (string $field): string => str_starts_with($field, 'places.') ? substr($field, 7) : $field,
            explode(',', $this->fieldMask($fieldOptions)),
        ));
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
