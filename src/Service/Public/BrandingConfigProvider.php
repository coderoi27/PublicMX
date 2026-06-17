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
     *     favicon_url:string,
     *     theme_color:string,
     *     default_meta_title:string,
     *     default_meta_description:string,
     *     social_share:array{title:string,description:string,image_url:string,twitter_card:string},
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

    public function absoluteAssetUrl(Request $request, string $assetUrl): string
    {
        if (str_starts_with($assetUrl, 'http://') || str_starts_with($assetUrl, 'https://')) {
            return $assetUrl;
        }

        return rtrim($request->getSchemeAndHttpHost(), '/') . '/' . ltrim($assetUrl, '/');
    }
}
