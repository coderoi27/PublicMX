<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Service\Public\CoreFeedClient;
use App\Service\Public\GooglePlacesClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;

final class GooglePlacesProxyController extends AbstractController
{
    #[Route('/api/explore/places', name: 'public_api_explore_places', methods: ['GET'])]
    public function __invoke(
        Request $request,
        CoreFeedClient $coreFeedClient,
        GooglePlacesClient $placesClient,
        CacheInterface $cache,
        #[\Symfony\Component\DependencyInjection\Attribute\Autowire('%app.google_maps_api_key%')]
        string $googleMapsApiKey
    ): JsonResponse {
        $lat = $request->query->get('lat');
        $lng = $request->query->get('lng');

        if (!is_numeric($lat) || !is_numeric($lng)) {
            return $this->json(['error' => 'Coordenadas invalidas'], 400);
        }

        $lat = (float) $lat;
        $lng = (float) $lng;

        // Obtain core feed (can be optimized with cache in the future)
        $feed = $coreFeedClient->fetchLocations($lat, $lng);
        $plugins = $feed['meta']['plugins'] ?? [];
        $isPluginEnabled = $plugins['google_places_proxy'] ?? false;

        if (!$isPluginEnabled) {
            return $this->json([]);
        }

        $categoryCatalog = $feed['meta']['category_catalog'] ?? [];
        $placeCategoryRules = $feed['meta']['place_category_rules'] ?? [];
        $blacklist = $feed['meta']['google_places_blacklist'] ?? [];

        // Cache the Google Places result based on coordinates (rounded to ~1km grid)
        $cacheKey = sprintf('google_places_%s_%s', round($lat, 3), round($lng, 3));
        
        $places = $cache->get($cacheKey, function (ItemInterface $item) use ($placesClient, $lat, $lng) {
            $item->expiresAfter(3600); // Cache for 1 hour
            return $placesClient->searchNearby($lat, $lng);
        });

        // Translate types to Canonical
        $mappedPlaces = [];
        foreach ($places as $place) {
            $placeId = $place['id'] ?? null;
            if ($placeId !== null && in_array($placeId, $blacklist, true)) {
                continue;
            }

            $mapped = $this->mapPlaceToCanonical($place, $categoryCatalog, $placeCategoryRules, $lat, $lng, $googleMapsApiKey);
            if ($mapped !== null) {
                $mappedPlaces[] = $mapped;
            }
        }

        return $this->json(['data' => $mappedPlaces]);
    }

    private function mapPlaceToCanonical(array $place, array $categoryCatalog, array $placeCategoryRules, float $originLat, float $originLng, string $apiKey): ?array
    {
        $types = $place['types'] ?? [];
        $types = is_array($types) ? array_values(array_filter($types, 'is_string')) : [];
        $primaryType = $place['primaryType'] ?? ($types[0] ?? null);

        if (!is_string($primaryType) || $primaryType === '') {
            return null;
        }

        [$matchedCategory, $classifiedBy] = $this->matchCategory($place, $categoryCatalog, $placeCategoryRules, $primaryType, $types);

        if ($matchedCategory === null) {
            return null;
        }

        $placeLat = $place['location']['latitude'] ?? null;
        $placeLng = $place['location']['longitude'] ?? null;
        
        $distanceMeters = null;
        if ($placeLat !== null && $placeLng !== null) {
            $distanceMeters = $this->distanceMeters($originLat, $originLng, (float) $placeLat, (float) $placeLng);
        }

        $photoName = null;
        if (isset($place['photos']) && is_array($place['photos']) && count($place['photos']) > 0) {
            $photoName = $place['photos'][0]['name'] ?? null;
        }
        $photoUrl = null;
        if ($photoName !== null) {
            $photoUrl = sprintf('https://places.googleapis.com/v1/%s/media?maxHeightPx=400&maxWidthPx=400&key=%s', $photoName, $apiKey);
        }

        return [
            'location_id' => 'google_' . ($place['id'] ?? md5(json_encode($place))),
            'merchant_name' => $place['displayName']['text'] ?? 'Local sin nombre',
            'location_name' => $place['displayName']['text'] ?? 'Local sin nombre',
            'lat' => $placeLat,
            'lng' => $placeLng,
            'short_address' => $place['formattedAddress'] ?? null,
            'distance_meters' => $distanceMeters,
            'photo_url' => $photoUrl,
            'rating' => $place['rating'] ?? null,
            'user_rating_count' => $place['userRatingCount'] ?? null,
            'whatsapp_enabled' => false,
            'whatsapp_e164' => null,
            'is_claimable' => true,
            'source_type' => 'google_places',
            'external_source_key' => $place['id'] ?? null,
            'publication_state' => 'public_visible',
            'gem_status' => 'none',
            'is_joyita' => false,
            'gem_reason_tags' => [],
            'classified_by' => $classifiedBy,
            'category_id' => $matchedCategory['id'] ?? null,
            'category_slug' => $matchedCategory['slug'] ?? null,
            'category_name' => $matchedCategory['name'] ?? null,
            'category_icon_key' => $matchedCategory['icon_key'] ?? null,
            'category_color_hex' => $matchedCategory['color_hex'] ?? null,
            'category_default_photo_url' => $matchedCategory['default_photo_url'] ?? null,
            'category_cover_photo_url' => $matchedCategory['cover_photo_url'] ?? null,
        ];
    }

    private function matchCategory(array $place, array $categoryCatalog, array $placeCategoryRules, string $primaryType, array $types): array
    {
        $categoriesById = [];
        foreach ($categoryCatalog as $category) {
            if (isset($category['id'])) {
                $categoriesById[(int) $category['id']] = $category;
            }
        }

        foreach ($this->rulesByType($placeCategoryRules, 'google_type') as $rule) {
            $category = $this->categoryForRule($rule, $categoriesById);
            $matchValue = $this->ruleMatchValue($rule);

            if ($category !== null && $matchValue !== '' && ($primaryType === $matchValue || in_array($matchValue, $types, true))) {
                return [$category, 'google_type_rule'];
            }
        }

        $placeName = $this->normalizeText((string) ($place['displayName']['text'] ?? ''));
        $typeLabels = $this->normalizeText(sprintf(
            '%s %s',
            (string) ($place['primaryTypeDisplayName']['text'] ?? ''),
            (string) ($place['googleMapsTypeLabel'] ?? '')
        ));
        foreach ($this->rulesByType($placeCategoryRules, 'name_keyword') as $rule) {
            $category = $this->categoryForRule($rule, $categoriesById);
            $matchValue = $this->normalizeText($this->ruleMatchValue($rule));

            if ($category !== null && $matchValue !== '') {
                if ($placeName !== '' && str_contains($placeName, $matchValue)) {
                    return [$category, 'name_keyword_rule'];
                }

                if ($typeLabels !== '' && str_contains($typeLabels, $matchValue)) {
                    return [$category, 'name_keyword_rule'];
                }
            }
        }

        foreach ($categoryCatalog as $category) {
            $mappings = $category['google_place_type_mappings'] ?? [];
            if (in_array($primaryType, $mappings, true)) {
                return [$category, 'legacy_google_type_mapping'];
            }
            if (count(array_intersect($types, $mappings)) > 0) {
                return [$category, 'legacy_google_type_mapping'];
            }
        }

        foreach ($categoryCatalog as $category) {
            if (($category['slug'] ?? null) === 'antojos') {
                return [$category, 'fallback_antojos'];
            }
        }

        if (count($categoryCatalog) > 0) {
            return [$categoryCatalog[0], 'fallback_first_category'];
        }

        return [null, 'unclassified'];
    }

    private function rulesByType(array $rules, string $ruleType): array
    {
        return array_values(array_filter(
            $rules,
            static fn (array $rule): bool => ($rule['rule_type'] ?? null) === $ruleType
        ));
    }

    private function categoryForRule(array $rule, array $categoriesById): ?array
    {
        $categoryId = isset($rule['category_id']) ? (int) $rule['category_id'] : null;
        if ($categoryId === null || !isset($categoriesById[$categoryId])) {
            return null;
        }

        return $categoriesById[$categoryId];
    }

    private function ruleMatchValue(array $rule): string
    {
        return (string) ($rule['match_value'] ?? '');
    }

    private function normalizeText(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = strtr($value, [
            'á' => 'a',
            'é' => 'e',
            'í' => 'i',
            'ó' => 'o',
            'ú' => 'u',
            'ü' => 'u',
            'ñ' => 'n',
        ]);
        $value = preg_replace('/[^a-z0-9]+/u', ' ', $value) ?? '';

        return trim($value);
    }

    private function distanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): int
    {
        $earthRadius = 6371000.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return (int) round($earthRadius * $c);
    }
}
