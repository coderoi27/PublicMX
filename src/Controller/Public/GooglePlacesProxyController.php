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
        $category = $this->normalizeCategoryFilter((string) $request->query->get('category', 'all'));

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
        $blacklistNameKeywords = $feed['meta']['google_places_blacklist_name_keywords'] ?? [];

        // Cache the Google Places result based on coordinates (rounded to ~1km grid)
        $cacheKey = sprintf('google_places_v4_%s_%s_%s', round($lat, 3), round($lng, 3), $category);
        
        $places = $cache->get($cacheKey, function (ItemInterface $item) use ($placesClient, $lat, $lng, $category) {
            $places = $this->discoverPlaces($placesClient, $lat, $lng, $category);
            $item->expiresAfter($places === [] ? 60 : 300);

            return $places;
        });

        // Translate types to Canonical
        $mappedPlaces = [];
        foreach ($places as $place) {
            if ($this->isBlacklistedPlace($place, $blacklist, $blacklistNameKeywords)) {
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

        $currentOpeningHours = is_array($place['currentOpeningHours'] ?? null) ? $place['currentOpeningHours'] : [];
        $regularOpeningHours = is_array($place['regularOpeningHours'] ?? null) ? $place['regularOpeningHours'] : [];
        $openingHours = $currentOpeningHours !== [] ? $currentOpeningHours : $regularOpeningHours;
        $openNow = $currentOpeningHours['openNow'] ?? ($regularOpeningHours['openNow'] ?? null);
        $openingHoursText = $openingHours['weekdayDescriptions'] ?? [];

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
            'open_now' => is_bool($openNow) ? $openNow : null,
            'opening_hours_text' => is_array($openingHoursText) ? array_values(array_filter($openingHoursText, 'is_string')) : [],
            'business_status' => is_string($place['businessStatus'] ?? null) ? $place['businessStatus'] : null,
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

        $placeName = $this->normalizeText($this->localizedTextValue($place['displayName'] ?? ''));
        $typeLabels = $this->normalizeText(sprintf(
            '%s %s',
            $this->localizedTextValue($place['primaryTypeDisplayName'] ?? ''),
            $this->localizedTextValue($place['googleMapsTypeLabel'] ?? '')
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

        $heuristicCategory = $this->matchCategoryByLocalHeuristic($place, $categoryCatalog, $primaryType, $types);
        if ($heuristicCategory !== null) {
            return [$heuristicCategory, 'local_keyword_heuristic'];
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

    /**
     * @return list<array<string, mixed>>
     */
    private function discoverPlaces(GooglePlacesClient $placesClient, float $lat, float $lng, string $category): array
    {
        $places = $placesClient->searchNearby($lat, $lng, 1800);

        foreach ($this->textQueriesForCategory($category) as $query) {
            $places = array_merge($places, $placesClient->searchTextNearby($query, $lat, $lng, 1800, 10));
        }

        return $this->deduplicatePlaces($places);
    }

    /**
     * @return list<string>
     */
    private function textQueriesForCategory(string $category): array
    {
        return match ($category) {
            'tacos' => ['taquería', 'tacos'],
            'antojitos', 'antojos' => ['antojitos mexicanos', 'tacos'],
            'cafe', 'cafes', 'coffee' => ['cafetería'],
            'postres' => ['postres', 'heladería'],
            'mariscos' => ['mariscos'],
            'hamburguesas' => ['hamburguesas'],
            'pizza', 'pizzas' => ['pizza'],
            'all', 'todos' => ['taquería', 'tacos'],
            default => [],
        };
    }

    /**
     * @param list<array<string, mixed>> $places
     * @return list<array<string, mixed>>
     */
    private function deduplicatePlaces(array $places): array
    {
        $deduplicated = [];
        foreach ($places as $place) {
            $placeId = is_string($place['id'] ?? null) ? $place['id'] : md5(json_encode($place));
            $deduplicated[$placeId] = $place;
        }

        return array_values($deduplicated);
    }

    private function matchCategoryByLocalHeuristic(array $place, array $categoryCatalog, string $primaryType, array $types): ?array
    {
        $haystack = $this->normalizeText(sprintf(
            '%s %s %s %s',
            $this->localizedTextValue($place['displayName'] ?? ''),
            $this->localizedTextValue($place['primaryTypeDisplayName'] ?? ''),
            $this->localizedTextValue($place['googleMapsTypeLabel'] ?? ''),
            implode(' ', $types)
        ));

        $typeSet = array_fill_keys(array_merge([$primaryType], $types), true);
        $candidates = [
            [['taco', 'taquer', 'mexican_restaurant'], ['taco', 'taqu', 'antoj']],
            [['pizza'], ['pizza']],
            [['hamburg', 'hamburger_restaurant'], ['hamburg']],
            [['cafe', 'cafeter', 'coffee_shop'], ['cafe', 'cafeter', 'coffee']],
            [['panader', 'bakery'], ['pan', 'bakery']],
            [['postre', 'helad', 'ice_cream_shop'], ['postre', 'helad']],
            [['marisco', 'seafood_restaurant'], ['marisco', 'seafood']],
            [['bar'], ['bar']],
            [['sushi', 'sushi_restaurant'], ['sushi']],
        ];

        foreach ($candidates as [$matchKeywords, $categoryKeywords]) {
            $matchesText = false;
            foreach ($matchKeywords as $keyword) {
                if (isset($typeSet[$keyword]) || str_contains($haystack, $keyword)) {
                    $matchesText = true;
                    break;
                }
            }

            if ($matchesText) {
                $category = $this->findCategoryByKeywords($categoryCatalog, $categoryKeywords);
                if ($category !== null) {
                    return $category;
                }
            }
        }

        return null;
    }

    private function findCategoryByKeywords(array $categoryCatalog, array $keywords): ?array
    {
        foreach ($categoryCatalog as $category) {
            $categoryText = $this->normalizeText(sprintf(
                '%s %s %s',
                (string) ($category['slug'] ?? ''),
                (string) ($category['name'] ?? ''),
                (string) ($category['icon_key'] ?? '')
            ));

            foreach ($keywords as $keyword) {
                if ($keyword !== '' && str_contains($categoryText, $keyword)) {
                    return $category;
                }
            }
        }

        return null;
    }

    private function normalizeCategoryFilter(string $category): string
    {
        $category = $this->normalizeText($category);

        return $category === '' || $category === 'todos' ? 'all' : $category;
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

    private function isBlacklistedPlace(array $place, array $blacklistedPlaceIds, array $blacklistedNameKeywords): bool
    {
        $placeId = $place['id'] ?? null;
        if (is_string($placeId) && in_array(mb_strtolower($placeId), $this->normalizeStringList($blacklistedPlaceIds), true)) {
            return true;
        }

        $placeName = $this->normalizeText($this->localizedTextValue($place['displayName'] ?? ''));
        if ($placeName === '') {
            return false;
        }

        foreach ($this->normalizeStringList($blacklistedNameKeywords) as $keyword) {
            $keyword = $this->normalizeText($keyword);
            if ($keyword !== '' && str_contains($placeName, $keyword)) {
                return true;
            }
        }

        return false;
    }

    private function localizedTextValue(mixed $value): string
    {
        if (is_array($value)) {
            $value = $value['text'] ?? '';
        }

        return is_scalar($value) ? (string) $value : '';
    }

    /**
     * @return list<string>
     */
    private function normalizeStringList(array $values): array
    {
        return array_values(array_filter(
            array_map(
                static fn (mixed $value): ?string => is_string($value) ? mb_strtolower(trim($value)) : null,
                $values
            ),
            static fn (?string $value): bool => $value !== null && $value !== ''
        ));
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
