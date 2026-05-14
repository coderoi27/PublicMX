<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class LegalDocumentClient
{
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly ?string $coreApiBaseUrl,
    ) {
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function fetchPublishedDocuments(): array
    {
        $payload = $this->request('/api/v1/legal-documents');

        return $payload['data'] ?? [];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function fetchDocument(string $slug): ?array
    {
        $payload = $this->request(sprintf('/api/v1/legal-documents/%s', rawurlencode($slug)));

        return is_array($payload['data'] ?? null) ? $payload['data'] : null;
    }

    /**
     * @return array{data?: mixed, meta?: array<string, mixed>, errors?: array<int, string>}
     */
    private function request(string $path): array
    {
        if ($this->coreApiBaseUrl === null || trim($this->coreApiBaseUrl) === '') {
            return ['data' => [], 'errors' => ['CORE_API_BASE_URL no esta configurado.']];
        }

        try {
            $response = $this->httpClient->request('GET', rtrim($this->coreApiBaseUrl, '/') . $path);

            return $response->toArray(false);
        } catch (TransportExceptionInterface|\Throwable $exception) {
            return ['data' => [], 'errors' => [$exception->getMessage()]];
        }
    }
}
