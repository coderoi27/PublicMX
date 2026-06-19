<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Cache\TagAwareCacheInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class BrandingConfigProvider
{
    private const CACHE_KEY = 'public_branding_v2';
    private const CACHE_TAG = 'core_feed';
    private const CACHE_TTL_SECONDS = 300;
    private const ERROR_CACHE_TTL_SECONDS = 30;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly ?string $coreApiBaseUrl,
        private readonly TagAwareCacheInterface $cache,
    ) {
    }

    /**
     * @return array{
     *     app_name:string,
     *     short_name:string,
     *     logo_url:string,
     *     logo_horizontal_url:string,
     *     icon_url:string,
     *     favicon_url:string,
     *     theme_color:string,
     *     default_meta_title:string,
     *     default_meta_description:string,
     *     social_share:array{title:string,description:string,image_url:string,twitter_card:string,twitter_title?:string,twitter_description?:string,twitter_image_url?:string},
     *     copyright:string
     * }
     */
    public function current(): array
    {
        $defaults = $this->defaults();
        if ($this->coreApiBaseUrl === null || trim($this->coreApiBaseUrl) === '') {
            return $defaults;
        }

        try {
            /** @var array<string, mixed> $remoteBranding */
            $remoteBranding = $this->cache->get(self::CACHE_KEY, function (ItemInterface $item): array {
                $item->tag([self::CACHE_TAG]);

                try {
                    $response = $this->httpClient->request(
                        'GET',
                        rtrim((string) $this->coreApiBaseUrl, '/') . '/api/v1/locations/feed',
                        [
                            'query' => ['branding_only' => 1],
                            'timeout' => 2.0,
                            'max_duration' => 2.5,
                        ],
                    );
                    $payload = $response->toArray(false);
                    $branding = $payload['meta']['settings']['public_branding'] ?? null;
                    if (!is_array($branding)) {
                        throw new \RuntimeException('Core no devolvio meta.settings.public_branding.');
                    }

                    $item->expiresAfter(self::CACHE_TTL_SECONDS);

                    return $branding;
                } catch (\Throwable) {
                    $item->expiresAfter(self::ERROR_CACHE_TTL_SECONDS);

                    return [];
                }
            });

            return $remoteBranding === [] ? $defaults : $this->normalize($remoteBranding, $defaults);
        } catch (\Throwable) {
            return $defaults;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function defaults(): array
    {
        return [
            'app_name' => 'Mi Monchis MX',
            'short_name' => 'Mi Monchis',
            'logo_url' => '/images/branding/logo-simple-vertical.png',
            'logo_horizontal_url' => '/images/mi-monchis-horizontal.png',
            'icon_url' => '/images/mi-monchis-cuadrado.png',
            'favicon_url' => '/images/mi-monchis-cuadrado.png',
            'theme_color' => '#F27F0D',
            'default_meta_title' => 'Mi Monchis MX',
            'default_meta_description' => 'Explora locales, antojitos y lugares cercanos en Mi Monchis MX.',
            'social_share' => [
                'title' => 'Mi Monchis MX',
                'description' => 'Explora locales y antojos cercanos en Mi Monchis MX.',
                'image_url' => '/images/mi-monchis-cuadrado.png',
                'twitter_card' => 'summary_large_image',
            ],
            'copyright' => "\u{00A9} 2026 Mi Monchis. Hecho con antojo.",
        ];
    }

    /**
     * @param array<string, mixed> $remote
     * @param array<string, mixed> $defaults
     *
     * @return array<string, mixed>
     */
    private function normalize(array $remote, array $defaults): array
    {
        $appName = $this->stringValue($remote['app_name'] ?? null, (string) $defaults['app_name']);
        $squareLogo = $this->assetUrl($remote['logo_square_url'] ?? null, (string) $defaults['icon_url']);
        $horizontalLogo = $this->assetUrl($remote['logo_horizontal_url'] ?? null, (string) $defaults['logo_horizontal_url']);
        $favicon = $this->assetUrl($remote['favicon_url'] ?? null, $squareLogo);
        $metaTitle = $this->stringValue($remote['default_meta_title'] ?? null, (string) $defaults['default_meta_title']);
        $metaDescription = $this->stringValue($remote['default_meta_description'] ?? null, (string) $defaults['default_meta_description']);
        $remoteSocial = is_array($remote['social_share'] ?? null) ? $remote['social_share'] : [];

        $socialTitle = $this->stringValue($remoteSocial['default_og_title'] ?? null, $metaTitle);
        $socialDescription = $this->stringValue($remoteSocial['default_og_description'] ?? null, $metaDescription);
        $socialImage = $this->socialImageUrl($remoteSocial['default_og_image'] ?? null, $squareLogo, (string) $defaults['social_share']['image_url']);

        return [
            'app_name' => $appName,
            'short_name' => $appName,
            'logo_url' => $squareLogo,
            'logo_horizontal_url' => $horizontalLogo,
            'icon_url' => $squareLogo,
            'favicon_url' => $favicon,
            'theme_color' => $this->themeColor($remote['theme_color'] ?? null, (string) $defaults['theme_color']),
            'default_meta_title' => $metaTitle,
            'default_meta_description' => $metaDescription,
            'social_share' => [
                'title' => $socialTitle,
                'description' => $socialDescription,
                'image_url' => $socialImage,
                'twitter_card' => $this->twitterCard($remoteSocial['twitter_card_type'] ?? null),
                'twitter_title' => $this->stringValue($remoteSocial['twitter_title'] ?? null, $socialTitle),
                'twitter_description' => $this->stringValue($remoteSocial['twitter_description'] ?? null, $socialDescription),
                'twitter_image_url' => $this->socialImageUrl($remoteSocial['twitter_image'] ?? null, $socialImage, (string) $defaults['social_share']['image_url']),
            ],
            'copyright' => sprintf("\u{00A9} %s %s. Hecho con antojo.", date('Y'), $appName),
        ];
    }

    private function stringValue(mixed $value, string $fallback): string
    {
        $value = is_string($value) ? trim($value) : '';

        return $value !== '' ? $value : $fallback;
    }

    private function assetUrl(mixed $value, string $fallback): string
    {
        $value = $this->stringValue($value, $fallback);
        if (preg_match('#^https?://#i', $value) === 1) {
            return $value;
        }

        if (str_starts_with($value, '/') && $this->coreApiBaseUrl !== null && trim($this->coreApiBaseUrl) !== '') {
            return rtrim($this->coreApiBaseUrl, '/') . $value;
        }

        return $value;
    }

    private function socialImageUrl(mixed $value, string $fallback, string $localFallback): string
    {
        $url = $this->assetUrl($value, $fallback);
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));
        $isRaster = preg_match('/\.(png|jpe?g)$/', $path) === 1;
        $isSecureAbsolute = str_starts_with($url, 'https://');

        return $isRaster && ($isSecureAbsolute || str_starts_with($url, '/')) ? $url : $localFallback;
    }

    private function themeColor(mixed $value, string $fallback): string
    {
        $value = is_string($value) ? trim($value) : '';

        return preg_match('/^#[0-9a-f]{6}$/i', $value) === 1 ? $value : $fallback;
    }

    private function twitterCard(mixed $value): string
    {
        return in_array($value, ['summary', 'summary_large_image'], true) ? $value : 'summary_large_image';
    }

    public function absoluteAssetUrl(Request $request, string $assetUrl): string
    {
        if (str_starts_with($assetUrl, 'http://') || str_starts_with($assetUrl, 'https://')) {
            return $assetUrl;
        }

        return rtrim($request->getSchemeAndHttpHost(), '/') . '/' . ltrim($assetUrl, '/');
    }
}
