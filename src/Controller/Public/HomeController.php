<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Entity\Public\PublicUserAddress;
use App\Entity\Public\PublicUserFavoritePlace;
use App\Service\Public\CoreFeedClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\ParameterBag\ParameterBagInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class HomeController extends AbstractController
{
    #[Route('/', name: 'public_home', methods: ['GET'])]
    public function __invoke(
        Request $request,
        CoreFeedClient $coreFeedClient,
        EntityManagerInterface $entityManager,
        ParameterBagInterface $parameterBag,
    ): Response
    {
        if ((bool) $parameterBag->get('app.alpha_invite_required') && $request->getSession()->get('alpha_access_granted') !== true) {
            return $this->render('public/alpha_request.html.twig', [
                'logo_url' => '/images/branding/logo-simple-vertical.png',
            ]);
        }

        $queryLat = $request->query->get('lat');
        $queryLng = $request->query->get('lng');

        $user = $this->getUser();
        $favoriteLocationIds = [];
        $savedAddresses = [];
        $primaryAddress = null;

        if ($user instanceof PublicUser) {
            $favorites = $entityManager->getRepository(PublicUserFavoritePlace::class)->findBy([
                'publicUser' => $user,
            ]);

            $favoriteLocationIds = array_values(array_map(
                static fn (PublicUserFavoritePlace $favorite): int => $favorite->getLocationId(),
                $favorites,
            ));

            $addresses = $entityManager->getRepository(PublicUserAddress::class)->findBy(
                ['publicUser' => $user],
                ['id' => 'DESC'],
            );

            $savedAddresses = array_map(static fn (PublicUserAddress $address): array => [
                'id' => $address->getId(),
                'label' => $address->getLabel(),
                'city' => $address->getCity(),
                'state' => $address->getState(),
                'reference' => $address->getReference(),
                'latitude' => $address->getLatitude(),
                'longitude' => $address->getLongitude(),
                'is_primary' => $address->isPrimary(),
            ], $addresses);

            $primaryAddress = $this->primaryAddress($addresses);
        }

        $effectiveLat = is_numeric((string) $queryLat) ? (float) $queryLat : null;
        $effectiveLng = is_numeric((string) $queryLng) ? (float) $queryLng : null;
        $effectiveLocationLabel = null;

        if (($effectiveLat === null || $effectiveLng === null) && $primaryAddress instanceof PublicUserAddress) {
            $effectiveLat = is_numeric((string) $primaryAddress->getLatitude()) ? (float) $primaryAddress->getLatitude() : null;
            $effectiveLng = is_numeric((string) $primaryAddress->getLongitude()) ? (float) $primaryAddress->getLongitude() : null;
            $effectiveLocationLabel = $primaryAddress->getLabel();
        }

        $feed = $coreFeedClient->fetchLocations($effectiveLat, $effectiveLng);

        return $this->render('public/home.html.twig', [
            'locations' => $feed['data'],
            'feed_errors' => $feed['errors'],
            'query_lat' => $effectiveLat,
            'query_lng' => $effectiveLng,
            'initial_location_label' => $effectiveLocationLabel,
            'current_user' => $user instanceof PublicUser ? $user : null,
            'favorite_location_ids' => $favoriteLocationIds,
            'saved_addresses' => $savedAddresses,
            'google_maps_api_key' => (string) $parameterBag->get('app.google_maps_api_key'),
            'walkthrough_enabled' => (bool) $parameterBag->get('app.walkthrough_enabled'),
            'logo_url' => '/images/branding/logo-simple-vertical.png',
        ]);
    }

    /**
     * @param array<int, PublicUserAddress> $addresses
     */
    private function primaryAddress(array $addresses): ?PublicUserAddress
    {
        foreach ($addresses as $address) {
            if ($address->isPrimary() && $address->getLatitude() !== null && $address->getLongitude() !== null) {
                return $address;
            }
        }

        foreach ($addresses as $address) {
            if ($address->getLatitude() !== null && $address->getLongitude() !== null) {
                return $address;
            }
        }

        return null;
    }
}
