<?php

declare(strict_types=1);

namespace App\Twig;

use App\Service\Public\BrandingConfigProvider;
use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

final class PublicBrandingExtension extends AbstractExtension
{
    public function __construct(private readonly BrandingConfigProvider $brandingConfigProvider)
    {
    }

    public function getFunctions(): array
    {
        return [
            new TwigFunction('public_branding', [$this->brandingConfigProvider, 'current']),
        ];
    }
}
