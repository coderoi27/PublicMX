<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Entity\Public\PublicUserReview;
use App\Entity\Public\PublicUserReviewMedia;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final class ReviewsController extends AbstractController
{
    #[Route('/api/v1/reviews', name: 'public_api_reviews_collection', methods: ['GET', 'POST'])]
    public function collection(Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $viewer = $this->getUser();
        $viewer = $viewer instanceof PublicUser ? $viewer : null;

        if ($request->isMethod('GET')) {
            $input = $this->subjectInput($request->query->all());
            if ($input['error'] !== null) {
                return $this->json(['data' => [], 'meta' => [], 'errors' => [$input['error']]], 422);
            }

            $qb = $entityManager->getRepository(PublicUserReview::class)->createQueryBuilder('review')
                ->leftJoin('review.media', 'media')
                ->addSelect('media')
                ->andWhere('review.reviewKey = :reviewKey')
                ->setParameter('reviewKey', $input['review_key'])
                ->orderBy('review.id', 'DESC');

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

            $reviews = $qb->getQuery()->getResult();

            return $this->json([
                'data' => array_map(
                    static fn (PublicUserReview $review): array => $review->toPayload($viewer),
                    $reviews,
                ),
                'meta' => [
                    'subject' => [
                        'source_type' => $input['source_type'],
                        'location_id' => $input['location_id'],
                        'external_source_key' => $input['external_source_key'],
                        'review_key' => $input['review_key'],
                    ],
                    'moderation' => [
                        'new_reviews_status' => PublicUserReview::STATUS_PENDING_REVIEW,
                        'public_visibility_status' => PublicUserReview::STATUS_PUBLISHED,
                    ],
                ],
                'errors' => [],
            ]);
        }

        if (!$viewer instanceof PublicUser) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Unauthenticated.']], 401);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Invalid JSON payload.']], 400);
        }

        $input = $this->reviewInput($payload);
        if ($input['error'] !== null) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => [$input['error']]], 422);
        }

        $review = $entityManager->getRepository(PublicUserReview::class)->findOneBy([
            'publicUser' => $viewer,
            'reviewKey' => $input['review_key'],
        ]);

        if (!$review instanceof PublicUserReview) {
            $review = (new PublicUserReview())
                ->setPublicUser($viewer)
                ->setSourceType($input['source_type'])
                ->setLocationId($input['location_id'])
                ->setExternalSourceKey($input['external_source_key'])
                ->setReviewKey($input['review_key']);

            $entityManager->persist($review);
        }

        $review
            ->setRatingValue($input['rating_value'])
            ->setReviewBody($input['review_body'])
            ->setStatus(PublicUserReview::STATUS_PENDING_REVIEW)
            ->setModerationNote(null)
            ->setModeratedAt(null);

        $entityManager->flush();

        return $this->json([
            'data' => $review->toPayload($viewer),
            'meta' => [
                'moderation' => [
                    'status' => PublicUserReview::STATUS_PENDING_REVIEW,
                    'message' => 'Tu reseña quedó en revisión para publicación.',
                ],
            ],
            'errors' => [],
        ], 201);
    }

    #[Route('/api/v1/reviews/{reviewId}/media', name: 'public_api_review_media_create', methods: ['POST'])]
    public function createMedia(int $reviewId, Request $request, EntityManagerInterface $entityManager): JsonResponse
    {
        $viewer = $this->getUser();
        if (!$viewer instanceof PublicUser) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Unauthenticated.']], 401);
        }

        $review = $entityManager->getRepository(PublicUserReview::class)->find($reviewId);
        if (!$review instanceof PublicUserReview || $review->getPublicUser()->getId() !== $viewer->getId()) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Review not found.']], 404);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Invalid JSON payload.']], 400);
        }

        $storageUrl = trim((string) ($payload['storage_url'] ?? $payload['url'] ?? ''));
        if ($storageUrl === '' || filter_var($storageUrl, FILTER_VALIDATE_URL) === false) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Field "storage_url" must be a valid URL.']], 422);
        }

        $media = (new PublicUserReviewMedia())
            ->setReview($review)
            ->setMediaType((string) ($payload['media_type'] ?? PublicUserReviewMedia::TYPE_IMAGE))
            ->setStorageUrl($storageUrl)
            ->setThumbnailUrl($this->stringOrNull($payload['thumbnail_url'] ?? null))
            ->setOriginalFilename($this->stringOrNull($payload['original_filename'] ?? null))
            ->setStatus(PublicUserReviewMedia::STATUS_PENDING_REVIEW);

        $review->addMedia($media);
        $review->setStatus(PublicUserReview::STATUS_PENDING_REVIEW);
        $entityManager->persist($media);
        $entityManager->flush();

        return $this->json([
            'data' => $media->toPayload(),
            'meta' => [
                'moderation' => [
                    'status' => PublicUserReviewMedia::STATUS_PENDING_REVIEW,
                ],
            ],
            'errors' => [],
        ], 201);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{error:?string,source_type:string,location_id:?int,external_source_key:?string,review_key:string,rating_value:int,review_body:?string}
     */
    private function reviewInput(array $payload): array
    {
        $subject = $this->subjectInput($payload);
        if ($subject['error'] !== null) {
            return [
                'error' => $subject['error'],
                'source_type' => PublicUserReview::SOURCE_CANONICAL,
                'location_id' => null,
                'external_source_key' => null,
                'review_key' => '',
                'rating_value' => 0,
                'review_body' => null,
            ];
        }

        $ratingValue = isset($payload['rating_value']) ? (int) $payload['rating_value'] : 0;
        if ($ratingValue < 1 || $ratingValue > 5) {
            return [
                'error' => 'Field "rating_value" must be between 1 and 5.',
                'source_type' => $subject['source_type'],
                'location_id' => $subject['location_id'],
                'external_source_key' => $subject['external_source_key'],
                'review_key' => $subject['review_key'],
                'rating_value' => 0,
                'review_body' => null,
            ];
        }

        return [
            'error' => null,
            'source_type' => $subject['source_type'],
            'location_id' => $subject['location_id'],
            'external_source_key' => $subject['external_source_key'],
            'review_key' => $subject['review_key'],
            'rating_value' => $ratingValue,
            'review_body' => $this->stringOrNull($payload['review_body'] ?? $payload['body'] ?? null),
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{error:?string,source_type:string,location_id:?int,external_source_key:?string,review_key:string}
     */
    private function subjectInput(array $payload): array
    {
        $locationId = isset($payload['location_id']) && is_numeric($payload['location_id']) ? (int) $payload['location_id'] : null;
        $sourceType = PublicUserReview::normalizeSourceType((string) ($payload['source_type'] ?? ($locationId !== null ? PublicUserReview::SOURCE_CANONICAL : '')));
        $externalSourceKey = trim((string) ($payload['external_source_key'] ?? $payload['place_id'] ?? ''));

        if ($sourceType === PublicUserReview::SOURCE_CANONICAL) {
            if ($locationId === null || $locationId <= 0) {
                return $this->subjectInputError('Field "location_id" is required for canonical reviews.');
            }

            return [
                'error' => null,
                'source_type' => $sourceType,
                'location_id' => $locationId,
                'external_source_key' => null,
                'review_key' => PublicUserReview::reviewKeyFor($sourceType, (string) $locationId),
            ];
        }

        if ($externalSourceKey === '') {
            return $this->subjectInputError('Field "external_source_key" is required for Places reviews.');
        }

        return [
            'error' => null,
            'source_type' => $sourceType,
            'location_id' => null,
            'external_source_key' => mb_substr($externalSourceKey, 0, 255),
            'review_key' => PublicUserReview::reviewKeyFor($sourceType, $externalSourceKey),
        ];
    }

    /**
     * @return array{error:string,source_type:string,location_id:null,external_source_key:null,review_key:string}
     */
    private function subjectInputError(string $error): array
    {
        return [
            'error' => $error,
            'source_type' => PublicUserReview::SOURCE_CANONICAL,
            'location_id' => null,
            'external_source_key' => null,
            'review_key' => '',
        ];
    }

    private function stringOrNull(mixed $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
