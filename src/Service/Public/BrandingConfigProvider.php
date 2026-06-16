<?php

declare(strict_types=1);

namespace App\Service\Public;

use Symfony\Component\HttpFoundation\Request;

final class BrandingConfigProvider
{
    /**
     * @return array{
     *     app_name:string,
     *     short_name:string,
     *     logo_url:string,
     *     logo_horizontal_url:string,
     *     icon_url:string,
     *     copyright:string
     * }
     */
    public function current(): array
    {
        return [
            'app_name' => 'Mi Monchis MX',
            'short_name' => 'Mi Monchis',
            'logo_url' => '/images/branding/logo-simple-vertical.png',
            'logo_horizontal_url' => '/images/mi-monchis-horizontal.png',
            'icon_url' => '/images/mi-monchis-cuadrado.png',
            'copyright' => "\u{00A9} 2026 Mi Monchis. Hecho con antojo.",
        ];
    }

    public function absoluteAssetUrl(Request $request, string $assetUrl): string
    {
        if (str_starts_with($assetUrl, 'http://') || str_starts_with($assetUrl, 'https://')) {
            return $assetUrl;
        }

        return rtrim($request->getSchemeAndHttpHost(), '/') . '/' . ltrim($assetUrl, '/');
    }
}
