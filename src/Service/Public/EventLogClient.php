<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class EventLogClient
{
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly ?string $coreApiBaseUrl,
    ) {
    }

    public function submit(array $payload): void
    {
        if ($this->coreApiBaseUrl === null || trim($this->coreApiBaseUrl) === '') {
            return;
        }

        try {
            $this->httpClient->request('POST', rtrim($this->coreApiBaseUrl, '/') . '/api/v1/event-logs', [
                'json' => $payload,
            ])->getStatusCode();
        } catch (TransportExceptionInterface|\Throwable) {
            // No bloquear flujos de producto por analítica.
        }
    }
}
