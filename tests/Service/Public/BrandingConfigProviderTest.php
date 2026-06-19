<?php

declare(strict_types=1);

namespace App\Tests\Service\Public;

use App\Service\Public\BrandingConfigProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\Cache\Adapter\TagAwareAdapter;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class BrandingConfigProviderTest extends TestCase
{
    public function testItConsumesAndNormalizesCoreBrandingContract(): void
    {
        $client = new MockHttpClient(new MockResponse(json_encode([
            'meta' => [
                'settings' => [
                    'public_branding' => [
                        'app_name' => 'Marca desde Core',
                        'logo_horizontal_url' => '/uploads/branding/horizontal.png',
                        'logo_square_url' => '/uploads/branding/square.jpg',
                        'favicon_url' => '/uploads/branding/favicon.png',
                        'theme_color' => '#123ABC',
                        'default_meta_title' => 'Titulo Core',
                        'default_meta_description' => 'Descripcion Core',
                        'social_share' => [
                            'default_og_title' => 'OG Core',
                            'default_og_description' => 'Descripcion OG',
                            'default_og_image' => '/uploads/branding/share.jpg',
                            'twitter_card_type' => 'summary',
                            'twitter_title' => 'Twitter Core',
                            'twitter_image' => '/uploads/branding/twitter.png',
                        ],
                    ],
                ],
            ],
        ], JSON_THROW_ON_ERROR)));
        $provider = new BrandingConfigProvider(
            $client,
            'https://core.mimonchis.mx',
            new TagAwareAdapter(new ArrayAdapter()),
        );

        $branding = $provider->current();

        self::assertSame('Marca desde Core', $branding['app_name']);
        self::assertSame('https://core.mimonchis.mx/uploads/branding/horizontal.png', $branding['logo_horizontal_url']);
        self::assertSame('https://core.mimonchis.mx/uploads/branding/favicon.png', $branding['favicon_url']);
        self::assertSame('#123ABC', $branding['theme_color']);
        self::assertSame('OG Core', $branding['social_share']['title']);
        self::assertSame('https://core.mimonchis.mx/uploads/branding/share.jpg', $branding['social_share']['image_url']);
        self::assertSame('Twitter Core', $branding['social_share']['twitter_title']);
        self::assertSame('https://core.mimonchis.mx/uploads/branding/twitter.png', $branding['social_share']['twitter_image_url']);
    }

    public function testItFallsBackLocallyWhenCoreContractIsUnavailable(): void
    {
        $provider = new BrandingConfigProvider(
            new MockHttpClient(new MockResponse('{"meta":{}}')),
            'https://core.mimonchis.mx',
            new TagAwareAdapter(new ArrayAdapter()),
        );

        $branding = $provider->current();

        self::assertSame('Mi Monchis MX', $branding['app_name']);
        self::assertSame('/images/mi-monchis-horizontal.png', $branding['logo_horizontal_url']);
        self::assertSame('/images/mi-monchis-cuadrado.png', $branding['social_share']['image_url']);
    }

    public function testItRejectsSvgAsPrimarySocialImage(): void
    {
        $client = new MockHttpClient(new MockResponse(json_encode([
            'meta' => [
                'settings' => [
                    'public_branding' => [
                        'logo_square_url' => '/uploads/branding/square.png',
                        'social_share' => [
                            'default_og_image' => '/uploads/branding/share.svg',
                        ],
                    ],
                ],
            ],
        ], JSON_THROW_ON_ERROR)));
        $provider = new BrandingConfigProvider(
            $client,
            'https://core.mimonchis.mx',
            new TagAwareAdapter(new ArrayAdapter()),
        );

        $branding = $provider->current();

        self::assertSame('/images/mi-monchis-cuadrado.png', $branding['social_share']['image_url']);
    }
}
