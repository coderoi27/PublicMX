<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class BlockedEmailDomainClient
{
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly ?string $coreApiBaseUrl,
    ) {
    }

    public function isBlocked(string $email): bool
    {
        $domain = mb_strtolower(trim(substr(strrchr($email, '@') ?: '', 1)));
        if ($domain === '' || $this->coreApiBaseUrl === null || trim($this->coreApiBaseUrl) === '') {
            return false;
        }

        try {
            $response = $this->httpClient->request('GET', rtrim($this->coreApiBaseUrl, '/') . '/api/v1/blocked-email-domains', [
                'headers' => ['Accept' => 'application/json'],
            ]);

            /** @var array{data?: array<int, array<string, mixed>>} $payload */
            $payload = $response->toArray(false);
            $blockedDomains = array_map(
                static fn (array $item): string => mb_strtolower((string) ($item['domain'] ?? '')),
                $payload['data'] ?? []
            );

            return in_array($domain, $blockedDomains, true);
        } catch (TransportExceptionInterface|\Throwable) {
            return false;
        }
    }
}
