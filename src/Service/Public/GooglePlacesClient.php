<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class GooglePlacesClient
{
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
        if (empty($this->googlePlacesApiKey)) {
            return [];
        }

        try {
            $request = $this->requestStack->getCurrentRequest();
            $referer = $request ? $request->getSchemeAndHttpHost() . '/' : 'http://localhost:8000/';

            $response = $this->httpClient->request('POST', 'https://places.googleapis.com/v1/places:searchNearby', [
                'headers' => [
                    'X-Goog-Api-Key' => $this->googlePlacesApiKey,
                    'X-Goog-FieldMask' => 'places.id,places.displayName,places.location,places.primaryType,places.primaryTypeDisplayName,places.types,places.googleMapsTypeLabel,places.formattedAddress,places.rating,places.userRatingCount,places.photos',
                    'Referer' => $referer,
                ],
                'json' => [
                    'includedTypes' => ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'ice_cream_shop', 'fast_food_restaurant', 'pizza_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'coffee_shop', 'mexican_restaurant', 'seafood_restaurant', 'steak_house', 'sushi_restaurant'],
                    'maxResultCount' => $maxResultCount,
                    'locationRestriction' => [
                        'circle' => [
                            'center' => [
                                'latitude' => $lat,
                                'longitude' => $lng,
                            ],
                            'radius' => (float) $radiusMeters,
                        ],
                    ],
                ],
            ]);

            $data = $response->toArray(false);

            return $data['places'] ?? [];
        } catch (TransportExceptionInterface|\Throwable $e) {
            return [];
        }
    }
}
