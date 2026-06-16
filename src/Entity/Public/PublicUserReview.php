<?php

declare(strict_types=1);

namespace App\Entity\Public;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'public_user_reviews')]
#[ORM\UniqueConstraint(name: 'uniq_public_user_review_subject', columns: ['public_user_id', 'review_key'])]
#[ORM\Index(name: 'idx_public_reviews_subject_status', columns: ['review_key', 'status'])]
#[ORM\HasLifecycleCallbacks]
class PublicUserReview
{
    public const SOURCE_CANONICAL = 'canonical';
    public const SOURCE_GOOGLE_PLACES = 'google_places';

    public const STATUS_PENDING_REVIEW = 'pending_review';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_HIDDEN = 'hidden';
    public const STATUS_REJECTED = 'rejected';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: PublicUser::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private PublicUser $publicUser;

    #[ORM\Column(length: 40)]
    private string $sourceType = self::SOURCE_CANONICAL;

    #[ORM\Column(nullable: true)]
    private ?int $locationId = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $externalSourceKey = null;

    #[ORM\Column(length: 320)]
    private string $reviewKey = '';

    #[ORM\Column(type: 'smallint')]
    private int $ratingValue = 5;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $reviewBody = null;

    #[ORM\Column(length: 32)]
    private string $status = self::STATUS_PENDING_REVIEW;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $moderationNote = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $moderatedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    /**
     * @var Collection<int, PublicUserReviewMedia>
     */
    #[ORM\OneToMany(mappedBy: 'review', targetEntity: PublicUserReviewMedia::class, cascade: ['persist'], orphanRemoval: true)]
    #[ORM\OrderBy(['id' => 'ASC'])]
    private Collection $media;

    public function __construct()
    {
        $this->media = new ArrayCollection();
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    #[ORM\PrePersist]
    public function onCreate(): void
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $this->createdAt ?? $now;
        $this->updatedAt = $now;
    }

    #[ORM\PreUpdate]
    public function onUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getPublicUser(): PublicUser
    {
        return $this->publicUser;
    }

    public function setPublicUser(PublicUser $publicUser): self
    {
        $this->publicUser = $publicUser;

        return $this;
    }

    public function getSourceType(): string
    {
        return $this->sourceType;
    }

    public function setSourceType(string $sourceType): self
    {
        $this->sourceType = self::normalizeSourceType($sourceType);

        return $this;
    }

    public function getLocationId(): ?int
    {
        return $this->locationId;
    }

    public function setLocationId(?int $locationId): self
    {
        $this->locationId = $locationId;

        return $this;
    }

    public function getExternalSourceKey(): ?string
    {
        return $this->externalSourceKey;
    }

    public function setExternalSourceKey(?string $externalSourceKey): self
    {
        $externalSourceKey = trim((string) $externalSourceKey);
        $this->externalSourceKey = $externalSourceKey === '' ? null : mb_substr($externalSourceKey, 0, 255);

        return $this;
    }

    public function getReviewKey(): string
    {
        if ($this->reviewKey !== '') {
            return $this->reviewKey;
        }

        if ($this->sourceType === self::SOURCE_GOOGLE_PLACES) {
            return self::reviewKeyFor($this->sourceType, (string) $this->externalSourceKey);
        }

        return self::reviewKeyFor(self::SOURCE_CANONICAL, (string) $this->locationId);
    }

    public function setReviewKey(string $reviewKey): self
    {
        $this->reviewKey = mb_substr(trim($reviewKey), 0, 320);

        return $this;
    }

    public function getRatingValue(): int
    {
        return $this->ratingValue;
    }

    public function setRatingValue(int $ratingValue): self
    {
        $this->ratingValue = max(1, min(5, $ratingValue));

        return $this;
    }

    public function getReviewBody(): ?string
    {
        return $this->reviewBody;
    }

    public function setReviewBody(?string $reviewBody): self
    {
        $reviewBody = trim((string) $reviewBody);
        $this->reviewBody = $reviewBody === '' ? null : mb_substr($reviewBody, 0, 1800);

        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): self
    {
        if (!in_array($status, self::statuses(), true)) {
            throw new \InvalidArgumentException(sprintf('Unsupported review status "%s".', $status));
        }

        $this->status = $status;

        return $this;
    }

    public function getModerationNote(): ?string
    {
        return $this->moderationNote;
    }

    public function setModerationNote(?string $moderationNote): self
    {
        $moderationNote = trim((string) $moderationNote);
        $this->moderationNote = $moderationNote === '' ? null : mb_substr($moderationNote, 0, 255);

        return $this;
    }

    public function getModeratedAt(): ?\DateTimeImmutable
    {
        return $this->moderatedAt;
    }

    public function setModeratedAt(?\DateTimeImmutable $moderatedAt): self
    {
        $this->moderatedAt = $moderatedAt;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * @return Collection<int, PublicUserReviewMedia>
     */
    public function getMedia(): Collection
    {
        return $this->media;
    }

    public function addMedia(PublicUserReviewMedia $media): self
    {
        if (!$this->media->contains($media)) {
            $this->media->add($media);
            $media->setReview($this);
        }

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(?PublicUser $viewer = null): array
    {
        $isMine = $viewer instanceof PublicUser && $viewer->getId() === $this->publicUser->getId();

        return [
            'id' => $this->id,
            'source_type' => $this->sourceType,
            'location_id' => $this->locationId,
            'external_source_key' => $this->externalSourceKey,
            'review_key' => $this->getReviewKey(),
            'rating_value' => $this->ratingValue,
            'review_body' => $this->reviewBody,
            'status' => $this->status,
            'is_mine' => $isMine,
            'author' => [
                'display_name' => trim($this->publicUser->getFirstName() . ' ' . mb_substr($this->publicUser->getLastName(), 0, 1) . '.'),
            ],
            'media' => array_map(
                static fn (PublicUserReviewMedia $media): array => $media->toPayload(),
                array_values(array_filter(
                    $this->media->toArray(),
                    static fn (PublicUserReviewMedia $media): bool => $isMine || $media->getStatus() === PublicUserReviewMedia::STATUS_PUBLISHED,
                )),
            ),
            'created_at' => $this->createdAt->format(DATE_ATOM),
            'updated_at' => $this->updatedAt->format(DATE_ATOM),
        ];
    }

    public static function reviewKeyFor(string $sourceType, string $identity): string
    {
        return sprintf('%s:%s', self::normalizeSourceType($sourceType), trim($identity));
    }

    public static function normalizeSourceType(string $sourceType): string
    {
        return match (strtolower(trim($sourceType))) {
            self::SOURCE_GOOGLE_PLACES, 'google', 'places' => self::SOURCE_GOOGLE_PLACES,
            default => self::SOURCE_CANONICAL,
        };
    }

    /**
     * @return list<string>
     */
    public static function statuses(): array
    {
        return [
            self::STATUS_PENDING_REVIEW,
            self::STATUS_PUBLISHED,
            self::STATUS_HIDDEN,
            self::STATUS_REJECTED,
        ];
    }
}
