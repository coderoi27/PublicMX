<?php

declare(strict_types=1);

namespace App\Service\Claim;

use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\Exception\ClientExceptionInterface;
use Symfony\Contracts\HttpClient\Exception\ServerExceptionInterface;

class LocationClaimCoreClient
{
    private HttpClientInterface $client;
    private ClaimFlowSessionManager $sessionManager;
    private string $coreBaseUrl;
    private int $timeout;

    public function __construct(
        HttpClientInterface $client,
        ClaimFlowSessionManager $sessionManager,
        string $coreBaseUrl,
        int $timeout = 10
    ) {
        $this->client = $client;
        $this->sessionManager = $sessionManager;
        $this->coreBaseUrl = rtrim($coreBaseUrl, '/');
        $this->timeout = $timeout;
    }

    private function request(string $method, string $path, array $options = []): array
    {
        $url = $this->coreBaseUrl . '/api/v1/location-claims' . $path;
        
        $defaultOptions = [
            'timeout' => $this->timeout,
            'headers' => [
                'Accept' => 'application/json',
            ],
        ];

        // Inject server-side stored bearer token
        $token = $this->sessionManager->getAccessToken();
        if ($token !== null) {
            $defaultOptions['headers']['Authorization'] = 'Bearer ' . $token;
        }

        $options = array_merge_recursive($defaultOptions, $options);

        try {
            $response = $this->client->request($method, $url, $options);
            
            $statusCode = $response->getStatusCode();
            $content = $response->toArray(false);
            
            if ($statusCode >= 400) {
                $errorMsg = $content['errors'][0] ?? 'Unknown error';
                throw new \RuntimeException(sprintf('Core API Error (%d): %s', $statusCode, $errorMsg), $statusCode);
            }

            return $content['data'] ?? $content;

        } catch (TransportExceptionInterface $e) {
            throw new \RuntimeException('Unable to communicate with Core API: ' . $e->getMessage(), 503, $e);
        } catch (ClientExceptionInterface|ServerExceptionInterface $e) {
            throw new \RuntimeException('Core API Error: ' . $e->getMessage(), $e->getResponse()->getStatusCode(), $e);
        }
    }

    public function createDraft(string $placeId, array $data): array
    {
        // This is a generic endpoint in core (we might need to adapt if it requires specific path)
        // Assuming POST /api/v1/location-claims
        return $this->request('POST', '', [
            'json' => array_merge(['place_id' => $placeId, 'submission_mode' => 'assisted'], $data)
        ]);
    }

    public function updateProgress(string $claimUuid, array $data): array
    {
        return $this->request('PATCH', '/' . $claimUuid . '/progress', [
            'json' => $data
        ]);
    }

    public function requestOtp(string $claimUuid): array
    {
        return $this->request('POST', '/' . $claimUuid . '/email-otp/request');
    }

    public function confirmOtp(string $claimUuid, string $code): array
    {
        return $this->request('POST', '/' . $claimUuid . '/email-otp/confirm', [
            'json' => ['code' => $code]
        ]);
    }

    public function requestResumeLink(string $email): void
    {
        $this->request('POST', '/resume-link', [
            'json' => ['email' => $email]
        ]);
    }

    public function resolveResumeToken(string $token): array
    {
        return $this->request('GET', '/resume/' . $token);
    }

    public function prepareEvidenceUpload(string $claimUuid, array $payload): array
    {
        return $this->request('POST', '/' . $claimUuid . '/evidence/uploads', [
            'json' => $payload
        ]);
    }

    public function completeEvidenceUpload(string $claimUuid, string $evidenceId, ?string $etag = null): array
    {
        $options = [];
        if ($etag !== null) {
            $options['json'] = ['etag' => $etag];
        }
        return $this->request('POST', '/' . $claimUuid . '/evidence/' . $evidenceId . '/complete', $options);
    }

    public function getClaim(string $claimUuid): array
    {
        return $this->request('GET', '/' . $claimUuid);
    }

    public function submitClaim(string $claimUuid, string $idempotencyKey): array
    {
        return $this->request('POST', '/' . $claimUuid . '/submit', [
            'headers' => [
                'Idempotency-Key' => $idempotencyKey
            ]
        ]);
    }
}
