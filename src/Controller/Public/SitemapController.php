<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Service\Public\CoreFeedClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class SitemapController extends AbstractController
{
    #[Route('/sitemap.xml', name: 'public_sitemap', methods: ['GET'])]
    public function __invoke(Request $request, CoreFeedClient $coreFeedClient): Response
    {
        $feed = $coreFeedClient->fetchLocations();
        $urls = [
            $request->getSchemeAndHttpHost() . $this->generateUrl('public_home'),
            $request->getSchemeAndHttpHost() . $this->generateUrl('public_legal_index'),
        ];

        foreach ($feed['data'] as $location) {
            if (($location['source_type'] ?? '') === 'google_places') {
                continue;
            }

            $ref = (string) ($location['location_slug'] ?? $location['location_id'] ?? '');
            if ($ref === '') {
                continue;
            }

            $urls[] = $request->getSchemeAndHttpHost() . $this->generateUrl('public_location_profile', ['locationRef' => $ref]);
        }

        $response = $this->render('public/sitemap.xml.twig', [
            'urls' => array_values(array_unique($urls)),
        ]);
        $response->headers->set('Content-Type', 'application/xml; charset=UTF-8');

        return $response;
    }
}
