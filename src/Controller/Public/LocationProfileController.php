<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Entity\Public\PublicUserReview;
use App\Service\Public\BrandingConfigProvider;
use App\Service\Public\CoreFeedClient;
use App\Service\Public\GooglePlacesClient;
use Doctrine\ORM\EntityManagerInterface;
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
        BrandingConfigProvider $brandingConfigProvider,
        GooglePlacesClient $placesClient,
        EntityManagerInterface $entityManager,
        ParameterBagInterface $parameterBag,
        #[\Symfony\Component\DependencyInjection\Attribute\Autowire('%app.google_maps_api_key%')]
        string $googleMapsApiKey,
    ): Response {
        $branding = $brandingConfigProvider->current();
        if ((bool) $parameterBag->get('app.alpha_invite_required') && $request->getSession()->get('alpha_access_granted') !== true) {
            return $this->render('public/alpha_request.html.twig', [
                'branding' => $branding,
                'logo_url' => $branding['logo_url'],
            ]);
        }

        $isGooglePlace = str_starts_with($locationRef, 'google_');
        $feed = $isGooglePlace ? ['data' => [], 'meta' => [], 'errors' => []] : $coreFeedClient->fetchLocations();
        $location = null;

        if ($isGooglePlace) {
            $location = $this->googlePlaceProfileLocation(
                substr($locationRef, 7),
                $request,
                $placesClient,
                $feed,
                $googleMapsApiKey,
            );
        }

        foreach ($feed['data'] as $candidate) {
            if ($location !== null) {
                break;
            }

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

        $openingHoursText = is_array($location['opening_hours_text'] ?? null) ? $location['opening_hours_text'] : [];

        return $this->render('public/location_profile.html.twig', [
            'location' => $location,
            'own_reviews' => $this->reviewsForLocation($location, $entityManager),
            'canonical_url' => $this->canonicalLocationUrl($request, $location),
            'qr_url' => ($location['source_type'] ?? null) === 'google_places'
                ? null
                : $this->generateUrl('public_location_profile_qr', ['locationRef' => $location['location_slug'] ?? $location['location_id']]),
            'current_hours_label' => $this->currentOpeningHoursLabel($openingHoursText),
            'feed_errors' => $feed['errors'],
            'branding' => $branding,
        ]);
    }

    /**
     * @param array<string, mixed> $location
     * @return list<array<string, mixed>>
     */
    private function reviewsForLocation(array $location, EntityManagerInterface $entityManager): array
    {
        $reviewKey = $this->reviewKeyForLocation($location);
        if ($reviewKey === null) {
            return [];
        }

        $viewer = $this->getUser();
        $viewer = $viewer instanceof PublicUser ? $viewer : null;
        $qb = $entityManager->getRepository(PublicUserReview::class)->createQueryBuilder('review')
            ->leftJoin('review.media', 'media')
            ->addSelect('media')
            ->andWhere('review.reviewKey = :reviewKey')
            ->setParameter('reviewKey', $reviewKey)
            ->orderBy('review.id', 'DESC')
            ->setMaxResults(12);

        if ($viewer instanceof PublicUser) {
            $qb
                ->andWhere('review.status = :published OR review.publicUser = :viewer')
                ->setParameter('published', PublicUserReview::STATUS_PUBLISHED)
                ->setParameter('viewer', $viewer);
        } else {
            $qb
                ->andWhere('review.status = :published')
                ->setParameter('published', PublicUserReview::STATUS_PUBLISHED);
        }

        return array_map(
            static fn (PublicUserReview $review): array => $review->toPayload($viewer),
            $qb->getQuery()->getResult(),
        );
    }

    /**
     * @param array<string, mixed> $location
     */
    private function reviewKeyForLocation(array $location): ?string
    {
        if (($location['source_type'] ?? null) === PublicUserReview::SOURCE_GOOGLE_PLACES) {
            $externalSourceKey = trim((string) ($location['external_source_key'] ?? $location['place_id'] ?? ''));

            return $externalSourceKey !== ''
                ? PublicUserReview::reviewKeyFor(PublicUserReview::SOURCE_GOOGLE_PLACES, $externalSourceKey)
                : null;
        }

        $locationId = $location['location_id'] ?? null;
        if (!is_numeric($locationId)) {
            return null;
        }

        return PublicUserReview::reviewKeyFor(PublicUserReview::SOURCE_CANONICAL, (string) (int) $locationId);
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

    /**
     * @param array{data: array<int, array<string, mixed>>, meta: array<string, mixed>, errors: array<int, string>} $feed
     *
     * @return array<string, mixed>|null
     */
    private function googlePlaceProfileLocation(
        string $placeId,
        Request $request,
        GooglePlacesClient $placesClient,
        array $feed,
        string $googleMapsApiKey,
    ): ?array {
        $place = $placesClient->fetchPlace($placeId, [
            'include_photos' => true,
            'include_ratings' => true,
            'include_opening_hours' => true,
            'include_service_attributes' => true,
        ]);

        if ($place === null) {
            return null;
        }

        $lat = is_numeric((string) $request->query->get('lat')) ? (float) $request->query->get('lat') : null;
        $lng = is_numeric((string) $request->query->get('lng')) ? (float) $request->query->get('lng') : null;
        $categoryCatalog = is_array($feed['meta']['category_catalog'] ?? null) ? $feed['meta']['category_catalog'] : [];
        $placeCategoryRules = is_array($feed['meta']['place_category_rules'] ?? null) ? $feed['meta']['place_category_rules'] : [];
        $matchedCategory = $this->matchGooglePlaceCategory($place, $categoryCatalog, $placeCategoryRules);
        $photoUrl = $this->googlePlacePhotoUrl($place, $googleMapsApiKey);
        $openingHours = is_array($place['currentOpeningHours'] ?? null)
            ? $place['currentOpeningHours']
            : (is_array($place['regularOpeningHours'] ?? null) ? $place['regularOpeningHours'] : []);
        $openNow = $openingHours['openNow'] ?? null;
        $placeLat = $place['location']['latitude'] ?? null;
        $placeLng = $place['location']['longitude'] ?? null;

        return [
            'location_id' => 'google_' . $placeId,
            'merchant_name' => $this->localizedTextValue($place['displayName'] ?? '') ?: 'Place sin nombre',
            'location_name' => $this->localizedTextValue($place['displayName'] ?? '') ?: 'Place sin nombre',
            'lat' => $placeLat,
            'lng' => $placeLng,
            'short_address' => is_string($place['formattedAddress'] ?? null) ? $place['formattedAddress'] : null,
            'distance_meters' => $lat !== null && $lng !== null && $placeLat !== null && $placeLng !== null
                ? $this->distanceMeters($lat, $lng, (float) $placeLat, (float) $placeLng)
                : null,
            'photo_url' => $photoUrl,
            'rating' => $place['rating'] ?? null,
            'user_rating_count' => $place['userRatingCount'] ?? null,
            'types' => is_array($place['types'] ?? null) ? $place['types'] : [],
            'service_delivery' => is_bool($place['delivery'] ?? null) ? $place['delivery'] : null,
            'service_takeaway' => is_bool($place['takeout'] ?? null) ? $place['takeout'] : null,
            'service_dine_in' => is_bool($place['dineIn'] ?? null) ? $place['dineIn'] : null,
            'open_now' => is_bool($openNow) ? $openNow : null,
            'opening_hours_text' => is_array($openingHours['weekdayDescriptions'] ?? null)
                ? array_values(array_filter($openingHours['weekdayDescriptions'], 'is_string'))
                : [],
            'business_status' => is_string($place['businessStatus'] ?? null) ? $place['businessStatus'] : null,
            'whatsapp_enabled' => false,
            'whatsapp_e164' => null,
            'is_claimable' => true,
            'source_type' => 'google_places',
            'external_source_key' => $placeId,
            'publication_state' => 'public_visible',
            'gem_status' => 'none',
            'category_id' => $matchedCategory['id'] ?? null,
            'category_slug' => $matchedCategory['slug'] ?? null,
            'category_name' => $matchedCategory['name'] ?? $this->localizedTextValue($place['primaryTypeDisplayName'] ?? '') ?: 'Place',
            'category_icon_key' => $matchedCategory['icon_key'] ?? null,
            'category_color_hex' => $matchedCategory['color_hex'] ?? null,
            'category_default_photo_url' => $matchedCategory['default_photo_url'] ?? null,
            'category_cover_photo_url' => $matchedCategory['cover_photo_url'] ?? null,
            'description' => 'Este lugar proviene de Google Places. Verifica horarios, servicios y disponibilidad directamente antes de visitar.',
        ];
    }

    /**
     * @param array<string, mixed> $place
     * @param array<int, array<string, mixed>> $categoryCatalog
     * @param array<int, array<string, mixed>> $placeCategoryRules
     *
     * @return array<string, mixed>|null
     */
    private function matchGooglePlaceCategory(array $place, array $categoryCatalog, array $placeCategoryRules): ?array
    {
        $types = is_array($place['types'] ?? null) ? array_values(array_filter($place['types'], 'is_string')) : [];
        $primaryType = is_string($place['primaryType'] ?? null) ? $place['primaryType'] : ($types[0] ?? '');
        $categoriesById = [];

        foreach ($categoryCatalog as $category) {
            if (isset($category['id'])) {
                $categoriesById[(int) $category['id']] = $category;
            }
        }

        foreach ($placeCategoryRules as $rule) {
            if (($rule['rule_type'] ?? null) !== 'google_type') {
                continue;
            }

            $matchValue = is_string($rule['match_value'] ?? null) ? $rule['match_value'] : '';
            $categoryId = isset($rule['category_id']) ? (int) $rule['category_id'] : null;
            if ($categoryId !== null && isset($categoriesById[$categoryId]) && ($primaryType === $matchValue || in_array($matchValue, $types, true))) {
                return $categoriesById[$categoryId];
            }
        }

        $placeName = $this->normalizeText($this->localizedTextValue($place['displayName'] ?? ''));
        $typeLabels = $this->normalizeText($this->localizedTextValue($place['primaryTypeDisplayName'] ?? '') . ' ' . $this->localizedTextValue($place['googleMapsTypeLabel'] ?? ''));
        foreach ($placeCategoryRules as $rule) {
            if (($rule['rule_type'] ?? null) !== 'name_keyword') {
                continue;
            }

            $matchValue = $this->normalizeText(is_string($rule['match_value'] ?? null) ? $rule['match_value'] : '');
            $categoryId = isset($rule['category_id']) ? (int) $rule['category_id'] : null;
            if ($matchValue !== '' && $categoryId !== null && isset($categoriesById[$categoryId]) && (str_contains($placeName, $matchValue) || str_contains($typeLabels, $matchValue))) {
                return $categoriesById[$categoryId];
            }
        }

        foreach ($categoryCatalog as $category) {
            $mappings = is_array($category['google_place_type_mappings'] ?? null) ? $category['google_place_type_mappings'] : [];
            if (in_array($primaryType, $mappings, true) || array_intersect($types, $mappings) !== []) {
                return $category;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $place
     */
    private function googlePlacePhotoUrl(array $place, string $apiKey): ?string
    {
        $photoName = $place['photos'][0]['name'] ?? null;
        if (!is_string($photoName) || $photoName === '') {
            return null;
        }

        return sprintf('https://places.googleapis.com/v1/%s/media?maxHeightPx=720&maxWidthPx=720&key=%s', $photoName, $apiKey);
    }

    private function localizedTextValue(mixed $value): string
    {
        if (is_string($value)) {
            return $value;
        }

        if (is_array($value) && is_string($value['text'] ?? null)) {
            return $value['text'];
        }

        return '';
    }

    private function normalizeText(string $value): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value)));
    }

    private function distanceMeters(float $fromLat, float $fromLng, float $toLat, float $toLng): int
    {
        $earthRadius = 6371000;
        $dLat = deg2rad($toLat - $fromLat);
        $dLng = deg2rad($toLng - $fromLng);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($fromLat)) * cos(deg2rad($toLat)) * sin($dLng / 2) ** 2;

        return (int) round($earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a)));
    }

    /**
     * @param array<int, mixed> $weekdayDescriptions
     */
    private function currentOpeningHoursLabel(array $weekdayDescriptions): ?string
    {
        if ($weekdayDescriptions === []) {
            return null;
        }

        $dayIndex = (int) (new \DateTimeImmutable('now', new \DateTimeZone('America/Mexico_City')))->format('N') - 1;
        $dayNames = [
            ['lunes', 'monday'],
            ['martes', 'tuesday'],
            ['miercoles', 'miércoles', 'wednesday'],
            ['jueves', 'thursday'],
            ['viernes', 'friday'],
            ['sabado', 'sábado', 'saturday'],
            ['domingo', 'sunday'],
        ];

        $expectedNames = $dayNames[$dayIndex] ?? [];
        foreach ($weekdayDescriptions as $description) {
            if (!is_string($description) || trim($description) === '') {
                continue;
            }

            $normalized = $this->normalizeText($description);
            foreach ($expectedNames as $dayName) {
                if (str_starts_with($normalized, $this->normalizeText($dayName))) {
                    return $this->formatTodayHoursLabel($description, $expectedNames[0]);
                }
            }
        }

        $fallback = $weekdayDescriptions[$dayIndex] ?? null;

        return is_string($fallback) && trim($fallback) !== ''
            ? $this->formatTodayHoursLabel($fallback, $expectedNames[0] ?? null)
            : null;
    }

    private function formatTodayHoursLabel(string $description, ?string $dayName): string
    {
        $label = trim($description);
        $label = str_replace(["\u{202F}", "\u{00A0}"], ' ', $label);
        $label = preg_replace('/\s+/', ' ', $label) ?: $label;

        if (str_contains($label, ':')) {
            [$detectedDay, $hours] = array_map('trim', explode(':', $label, 2));
            $day = $dayName ?: mb_strtolower($detectedDay);

            return sprintf('%s %s', mb_strtolower($day), $this->normalizeHoursRange($hours));
        }

        return mb_strtolower($this->normalizeHoursRange($label));
    }

    private function normalizeHoursRange(string $hours): string
    {
        $normalized = str_replace(['–', '—'], ' - ', trim($hours));
        $normalized = preg_replace('/\s+/', ' ', $normalized) ?: $normalized;

        return str_replace([' AM', ' PM', ' a.m.', ' p.m.'], [' am', ' pm', ' am', ' pm'], $normalized);
    }
}
