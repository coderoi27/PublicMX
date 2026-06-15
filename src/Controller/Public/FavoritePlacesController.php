<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Entity\Public\PublicUserFavoritePlace;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final class FavoritePlacesController extends AbstractController
{
    #[Route('/api/v1/me/favorites', name: 'public_api_favorites_collection', methods: ['GET', 'POST'])]
    public function collection(Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $user = $this->getUser();
        if (!$user instanceof PublicUser) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Unauthenticated.']], 401);
        }

        if ($request->isMethod('GET')) {
            $favorites = $entityManager->getRepository(PublicUserFavoritePlace::class)->findBy(['publicUser' => $user], ['id' => 'DESC']);

            $data = array_map(static fn (PublicUserFavoritePlace $favorite): array => $favorite->toPayload(), $favorites);

            return $this->json(['data' => $data, 'meta' => [], 'errors' => []]);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Invalid JSON payload.']], 400);
        }

        $input = $this->favoriteInput($payload);
        if ($input['error'] !== null) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => [$input['error']]], 422);
        }

        $existing = $entityManager->getRepository(PublicUserFavoritePlace::class)->findOneBy([
            'publicUser' => $user,
            'favoriteKey' => $input['favorite_key'],
        ]);

        $favorite = $existing;
        if (!$favorite instanceof PublicUserFavoritePlace) {
            $favorite = (new PublicUserFavoritePlace())
                ->setPublicUser($user)
                ->setLocationId($input['location_id'])
                ->setSourceType($input['source_type'])
                ->setExternalSourceKey($input['external_source_key'])
                ->setFavoriteKey($input['favorite_key']);

            $entityManager->persist($favorite);
        }

        $favorite->setSnapshot(
            $input['snapshot']['name'],
            $input['snapshot']['address'],
            $input['snapshot']['photo_url'],
            $input['snapshot']['category_slug'],
            $input['snapshot']['category_name'],
            $input['snapshot']['lat'],
            $input['snapshot']['lng'],
        );

        $entityManager->flush();

        return $this->json([
            'data' => $favorite->toPayload(),
            'meta' => [],
            'errors' => [],
        ], 201);
    }

    #[Route('/api/v1/me/favorites/{favoriteRef}', name: 'public_api_favorites_delete', methods: ['DELETE'])]
    public function delete(string $favoriteRef, EntityManagerInterface $entityManager): JsonResponse
    {
        $user = $this->getUser();
        if (!$user instanceof PublicUser) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Unauthenticated.']], 401);
        }

        $favorite = $this->findFavoriteForDelete($favoriteRef, $user, $entityManager);
        $payload = $favorite instanceof PublicUserFavoritePlace ? $favorite->toPayload() : ['favorite_key' => $favoriteRef];

        if ($favorite instanceof PublicUserFavoritePlace) {
            $entityManager->remove($favorite);
            $entityManager->flush();
        }

        return $this->json(['data' => $payload, 'meta' => [], 'errors' => []]);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{
     *     error:?string,
     *     source_type:string,
     *     location_id:?int,
     *     external_source_key:?string,
     *     favorite_key:string,
     *     snapshot:array{name:?string,address:?string,photo_url:?string,category_slug:?string,category_name:?string,lat:mixed,lng:mixed}
     * }
     */
    private function favoriteInput(array $payload): array
    {
        $locationId = isset($payload['location_id']) && is_numeric($payload['location_id']) ? (int) $payload['location_id'] : null;
        $sourceType = PublicUserFavoritePlace::normalizeSourceType((string) ($payload['source_type'] ?? ($locationId !== null ? PublicUserFavoritePlace::SOURCE_CANONICAL : '')));
        $externalSourceKey = trim((string) ($payload['external_source_key'] ?? $payload['place_id'] ?? ''));

        if ($sourceType === PublicUserFavoritePlace::SOURCE_CANONICAL) {
            if ($locationId === null || $locationId <= 0) {
                return $this->favoriteInputError('Field "location_id" is required for canonical favorites.');
            }

            $externalSourceKey = null;
            $favoriteKey = PublicUserFavoritePlace::favoriteKeyFor($sourceType, (string) $locationId);
        } else {
            if ($externalSourceKey === '') {
                return $this->favoriteInputError('Field "external_source_key" is required for Places favorites.');
            }

            $locationId = null;
            $favoriteKey = PublicUserFavoritePlace::favoriteKeyFor($sourceType, $externalSourceKey);
        }

        $snapshot = is_array($payload['snapshot'] ?? null) ? $payload['snapshot'] : [];

        return [
            'error' => null,
            'source_type' => $sourceType,
            'location_id' => $locationId,
            'external_source_key' => $externalSourceKey,
            'favorite_key' => $favoriteKey,
            'snapshot' => [
                'name' => $this->stringOrNull($snapshot['name'] ?? $payload['name'] ?? $payload['location_name'] ?? null),
                'address' => $this->stringOrNull($snapshot['address'] ?? $payload['address'] ?? $payload['short_address'] ?? null),
                'photo_url' => $this->stringOrNull($snapshot['photo_url'] ?? $payload['photo_url'] ?? null),
                'category_slug' => $this->stringOrNull($snapshot['category_slug'] ?? $payload['category_slug'] ?? null),
                'category_name' => $this->stringOrNull($snapshot['category_name'] ?? $payload['category_name'] ?? null),
                'lat' => $snapshot['lat'] ?? $payload['lat'] ?? null,
                'lng' => $snapshot['lng'] ?? $payload['lng'] ?? null,
            ],
        ];
    }

    /**
     * @return array{
     *     error:string,
     *     source_type:string,
     *     location_id:null,
     *     external_source_key:null,
     *     favorite_key:string,
     *     snapshot:array{name:null,address:null,photo_url:null,category_slug:null,category_name:null,lat:null,lng:null}
     * }
     */
    private function favoriteInputError(string $error): array
    {
        return [
            'error' => $error,
            'source_type' => PublicUserFavoritePlace::SOURCE_CANONICAL,
            'location_id' => null,
            'external_source_key' => null,
            'favorite_key' => '',
            'snapshot' => [
                'name' => null,
                'address' => null,
                'photo_url' => null,
                'category_slug' => null,
                'category_name' => null,
                'lat' => null,
                'lng' => null,
            ],
        ];
    }

    private function findFavoriteForDelete(string $favoriteRef, PublicUser $user, EntityManagerInterface $entityManager): ?PublicUserFavoritePlace
    {
        $repository = $entityManager->getRepository(PublicUserFavoritePlace::class);
        $favoriteRef = trim(urldecode($favoriteRef));

        $favorite = $repository->findOneBy([
            'publicUser' => $user,
            'favoriteKey' => $favoriteRef,
        ]);
        if ($favorite instanceof PublicUserFavoritePlace) {
            return $favorite;
        }

        if (ctype_digit($favoriteRef)) {
            $favorite = $repository->findOneBy([
                'publicUser' => $user,
                'locationId' => (int) $favoriteRef,
            ]);

            return $favorite instanceof PublicUserFavoritePlace ? $favorite : null;
        }

        return null;
    }

    private function stringOrNull(mixed $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
