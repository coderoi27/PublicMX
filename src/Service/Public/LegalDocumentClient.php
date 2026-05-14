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
        $documents = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $documents = array_values(array_filter(
            $documents,
            static fn (mixed $document): bool => is_array($document) && self::isValidListDocument($document)
        ));

        return $documents !== [] ? $documents : array_values(self::fallbackDocuments(false));
    }

    /**
     * @return array<string, mixed>|null
     */
    public function fetchDocument(string $slug): ?array
    {
        $payload = $this->request(sprintf('/api/v1/legal-documents/%s', rawurlencode($slug)));
        $document = $payload['data'] ?? null;
        if (is_array($document) && self::isValidShowDocument($document)) {
            return $document;
        }

        return self::fallbackDocuments(true)[$slug] ?? null;
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

    /**
     * @param array<string, mixed> $document
     */
    private static function isValidListDocument(array $document): bool
    {
        return isset($document['slug'], $document['title'])
            && is_string($document['slug'])
            && trim($document['slug']) !== ''
            && is_string($document['title'])
            && trim($document['title']) !== '';
    }

    /**
     * @param array<string, mixed> $document
     */
    private static function isValidShowDocument(array $document): bool
    {
        return self::isValidListDocument($document)
            && isset($document['body'])
            && is_string($document['body'])
            && trim($document['body']) !== '';
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function fallbackDocuments(bool $includeBody): array
    {
        $documents = [
            'aviso-privacidad' => [
                'slug' => 'aviso-privacidad',
                'title' => 'Aviso de privacidad',
                'summary' => 'Tratamiento de correo, ubicación, interacciones y datos técnicos para operar Mi Monchis MX.',
                'version_label' => 'v1.0',
                'updated_at' => '2026-05-11T00:00:00-06:00',
                'body' => 'Mi Monchis MX trata tu correo, ubicación autorizada, direcciones guardadas, favoritos, interacciones y datos técnicos para operar la webapp, mantenerla segura, enviarte avisos operativos y mejorar la experiencia. No vendemos tus datos. Puedes ejercer derechos ARCO o revocar consentimientos escribiendo a privacidad@mimonchis.mx.',
            ],
            'cookies' => [
                'slug' => 'cookies',
                'title' => 'Política de cookies',
                'summary' => 'Cookies esenciales, preferencias y analítica para el alpha.',
                'version_label' => 'v1.0',
                'updated_at' => '2026-05-11T00:00:00-06:00',
                'body' => 'Usamos cookies esenciales para seguridad y funcionamiento. Las cookies o tecnologías opcionales de analítica ayudan a medir el uso de la plataforma y mejorarla. Puedes aceptar todas, rechazar las no esenciales o ajustar tu decisión desde el banner. Google Maps puede usar tecnologías propias para renderizar mapas y funciones relacionadas.',
            ],
            'terminos-publico' => [
                'slug' => 'terminos-publico',
                'title' => 'Términos para usuarios',
                'summary' => 'Reglas básicas del servicio público de descubrimiento.',
                'version_label' => 'v1.0',
                'updated_at' => '2026-05-11T00:00:00-06:00',
                'body' => 'Mi Monchis MX es una plataforma alpha de descubrimiento de locales. La información puede provenir de dueños, demo interna o terceros como Google Places. El servicio se ofrece en estado alpha y puede cambiar. El usuario debe usar la plataforma sin abuso, scraping, spam o uso indebido.',
            ],
            'disclaimer-terceros' => [
                'slug' => 'disclaimer-terceros',
                'title' => 'Disclaimer de terceros',
                'summary' => 'Datos de Google, mapas, WhatsApp y enlaces externos.',
                'version_label' => 'v1.0',
                'updated_at' => '2026-05-11T00:00:00-06:00',
                'body' => 'Algunos datos, mapas, fotografías, horarios, reseñas o enlaces pueden provenir de terceros. Mi Monchis MX no controla servicios externos como Google Maps, Google Places, WhatsApp o redes sociales. Verifica información crítica directamente con el local.',
            ],
        ];

        if ($includeBody) {
            return $documents;
        }

        return array_map(static function (array $document): array {
            unset($document['body']);

            return $document;
        }, $documents);
    }
}
