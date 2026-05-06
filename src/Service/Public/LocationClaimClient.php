<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class LocationClaimClient
{
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly ?string $coreApiBaseUrl,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array{ok: bool, errors: array<int, string>, claim_id: int|null}
     */
    public function submit(array $payload): array
    {
        if ($this->coreApiBaseUrl === null || trim($this->coreApiBaseUrl) === '') {
            return [
                'ok' => false,
                'errors' => ['CORE_API_BASE_URL no esta configurado en Public-MiMonchisMX.'],
                'claim_id' => null,
            ];
        }

        try {
            $response = $this->httpClient->request('POST', rtrim($this->coreApiBaseUrl, '/') . '/api/v1/location-claims', [
                'headers' => ['Accept' => 'application/json'],
                'json' => $payload,
            ]);

            /** @var array{data?: array<string, mixed>|null, errors?: array<int, string>} $payloadResponse */
            $payloadResponse = $response->toArray(false);

            return [
                'ok' => $response->getStatusCode() >= 200 && $response->getStatusCode() < 300 && ($payloadResponse['errors'] ?? []) === [],
                'errors' => $payloadResponse['errors'] ?? [],
                'claim_id' => is_array($payloadResponse['data'] ?? null) ? (int) ($payloadResponse['data']['claim_id'] ?? 0) : null,
            ];
        } catch (TransportExceptionInterface|\Throwable $exception) {
            return [
                'ok' => false,
                'errors' => [$exception->getMessage()],
                'claim_id' => null,
            ];
        }
    }
}
