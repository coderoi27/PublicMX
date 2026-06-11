<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Service\Public\CoreFeedClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\ParameterBag\ParameterBagInterface;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class LocationProfileController extends AbstractController
{
    #[Route('/l/{locationRef}', name: 'public_location_profile', methods: ['GET'])]
    public function __invoke(
        string $locationRef,
        Request $request,
        CoreFeedClient $coreFeedClient,
        ParameterBagInterface $parameterBag,
    ): Response {
        if ((bool) $parameterBag->get('app.alpha_invite_required') && $request->getSession()->get('alpha_access_granted') !== true) {
            return $this->render('public/alpha_request.html.twig', [
                'logo_url' => '/images/branding/logo-simple-vertical.png',
            ]);
        }

        $feed = $coreFeedClient->fetchLocations();
        $location = null;

        foreach ($feed['data'] as $candidate) {
            if (
                (isset($candidate['location_id']) && (string) $candidate['location_id'] === $locationRef)
                || (isset($candidate['location_slug']) && (string) $candidate['location_slug'] === $locationRef)
            ) {
                $location = $candidate;
                break;
            }
        }

        if ($location === null) {
            throw $this->createNotFoundException('Perfil no encontrado.');
        }

        return $this->render('public/location_profile.html.twig', [
            'location' => $location,
            'canonical_url' => $this->canonicalLocationUrl($request, $location),
            'qr_url' => $this->generateUrl('public_location_profile_qr', ['locationRef' => $location['location_slug'] ?? $location['location_id']]),
            'feed_errors' => $feed['errors'],
        ]);
    }

    #[Route('/l/{locationRef}/qr.svg', name: 'public_location_profile_qr', methods: ['GET'])]
    public function qr(string $locationRef, Request $request, CoreFeedClient $coreFeedClient): RedirectResponse
    {
        $feed = $coreFeedClient->fetchLocations();
        foreach ($feed['data'] as $candidate) {
            if (
                (isset($candidate['location_id']) && (string) $candidate['location_id'] === $locationRef)
                || (isset($candidate['location_slug']) && (string) $candidate['location_slug'] === $locationRef)
            ) {
                $url = $this->canonicalLocationUrl($request, $candidate);

                return $this->redirect(sprintf(
                    'https://api.qrserver.com/v1/create-qr-code/?size=360x360&format=svg&data=%s',
                    rawurlencode($url),
                ));
            }
        }

        throw $this->createNotFoundException('QR no disponible.');
    }

    /**
     * @param array<string, mixed> $location
     */
    private function canonicalLocationUrl(Request $request, array $location): string
    {
        $ref = (string) ($location['location_slug'] ?? $location['location_id'] ?? '');

        return $request->getSchemeAndHttpHost() . $this->generateUrl('public_location_profile', ['locationRef' => $ref]);
    }
}
