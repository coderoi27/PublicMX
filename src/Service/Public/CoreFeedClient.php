<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Cache\TagAwareCacheInterface;

final class CoreFeedClient
{
    private const CACHE_TAG = 'core_feed';
    private const SUCCESS_TTL_SECONDS = 120;
    private const ERROR_TTL_SECONDS = 15;
    private const DEFAULT_RADIUS_METERS = 1000;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly ?string $coreApiBaseUrl,
        private readonly TagAwareCacheInterface $cache,
    ) {
    }

    /**
     * @return array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>}
     */
    public function fetchLocations(?float $lat = null, ?float $lng = null): array
    {
        $cacheKey = sprintf(
            'core_feed_v2_%s_%s',
            $lat !== null ? number_format($lat, 3, '.', '') : 'global',
            $lng !== null ? number_format($lng, 3, '.', '') : 'global',
        );

        /** @var array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>} $feed */
        $feed = $this->cache->get($cacheKey, function (ItemInterface $item) use ($lat, $lng): array {
            $feed = $this->fetchLocationsFromCore($lat, $lng);
            $feed = $this->filterLocationsAround($feed, $lat, $lng);

            $item->tag([self::CACHE_TAG]);
            $item->expiresAfter($feed['errors'] === [] ? self::SUCCESS_TTL_SECONDS : self::ERROR_TTL_SECONDS);

            return $feed;
        });

        return $feed;
    }

    /**
     * @return array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>}
     */
    private function fetchLocationsFromCore(?float $lat = null, ?float $lng = null): array
    {
        if ($this->coreApiBaseUrl === null || trim($this->coreApiBaseUrl) === '') {
            return [
                'data' => [],
                'meta' => [],
                'errors' => ['CORE_API_BASE_URL no esta configurado en Public-MiMonchisMX.'],
            ];
        }

        $query = array_filter([
            'lat' => $lat,
            'lng' => $lng,
        ], static fn (mixed $value): bool => $value !== null && $value !== '');

        try {
            $response = $this->httpClient->request('GET', rtrim($this->coreApiBaseUrl, '/') . '/api/v1/locations/feed', [
                'query' => $query,
            ]);

            /** @var array{data?: array<int, array<string, mixed>>, meta?: array<string, mixed>, errors?: array<int, string>} $payload */
            $payload = $response->toArray(false);

            return [
                'data' => $payload['data'] ?? [],
                'meta' => $payload['meta'] ?? [],
                'errors' => $payload['errors'] ?? [],
            ];
        } catch (TransportExceptionInterface|\Throwable $exception) {
            return [
                'data' => [],
                'meta' => [],
                'errors' => [$exception->getMessage()],
            ];
        }
    }

    /**
     * @param array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>} $feed
     *
     * @return array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>}
     */
    private function filterLocationsAround(array $feed, ?float $lat, ?float $lng): array
    {
        if ($lat === null || $lng === null || $feed['data'] === []) {
            return $feed;
        }

        $radiusMeters = $this->feedRadiusMeters($feed);
        $feed['data'] = array_values(array_filter(
            $feed['data'],
            function (array $location) use ($lat, $lng, $radiusMeters): bool {
                $locationLat = $location['lat'] ?? $location['latitude'] ?? null;
                $locationLng = $location['lng'] ?? $location['longitude'] ?? null;

                if (!is_numeric((string) $locationLat) || !is_numeric((string) $locationLng)) {
                    return false;
                }

                $distanceMeters = $location['distance_meters'] ?? self::distanceMeters($lat, $lng, (float) $locationLat, (float) $locationLng);
                if (!is_numeric((string) $distanceMeters)) {
                    return false;
                }

                $location['distance_meters'] = (int) $distanceMeters;

                return (int) $distanceMeters <= $radiusMeters;
            }
        ));

        $feed['meta']['public_geo_filter'] = [
            'enabled' => true,
            'lat' => $lat,
            'lng' => $lng,
            'radius_meters' => $radiusMeters,
            'visible_count' => count($feed['data']),
        ];

        return $feed;
    }

    /**
     * @param array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>} $feed
     */
    private function feedRadiusMeters(array $feed): int
    {
        $settings = $feed['meta']['settings']['google_places_proxy'] ?? [];
        $radius = is_array($settings) ? (int) ($settings['nearby_radius_meters'] ?? self::DEFAULT_RADIUS_METERS) : self::DEFAULT_RADIUS_METERS;

        return max(100, min(1000, $radius));
    }

    private static function distanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): int
    {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return (int) round($earthRadius * (2 * atan2(sqrt($a), sqrt(1 - $a))));
    }
}
