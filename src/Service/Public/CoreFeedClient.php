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
            'core_feed_v1_%s_%s',
            $lat !== null ? number_format($lat, 3, '.', '') : 'global',
            $lng !== null ? number_format($lng, 3, '.', '') : 'global',
        );

        /** @var array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>} $feed */
        $feed = $this->cache->get($cacheKey, function (ItemInterface $item) use ($lat, $lng): array {
            $feed = $this->fetchLocationsFromCore($lat, $lng);

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
}
