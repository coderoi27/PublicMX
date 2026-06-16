<?php

declare(strict_types=1);

namespace App\Entity\Public;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'public_user_review_media')]
#[ORM\Index(name: 'idx_public_review_media_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class PublicUserReviewMedia
{
    public const TYPE_IMAGE = 'image';

    public const STATUS_PENDING_REVIEW = 'pending_review';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_HIDDEN = 'hidden';
    public const STATUS_REJECTED = 'rejected';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: PublicUserReview::class, inversedBy: 'media')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private PublicUserReview $review;

    #[ORM\Column(length: 32)]
    private string $mediaType = self::TYPE_IMAGE;

    #[ORM\Column(length: 1024)]
    private string $storageUrl;

    #[ORM\Column(length: 1024, nullable: true)]
    private ?string $thumbnailUrl = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $originalFilename = null;

    #[ORM\Column(length: 32)]
    private string $status = self::STATUS_PENDING_REVIEW;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
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

    public function getReview(): PublicUserReview
    {
        return $this->review;
    }

    public function setReview(PublicUserReview $review): self
    {
        $this->review = $review;

        return $this;
    }

    public function getMediaType(): string
    {
        return $this->mediaType;
    }

    public function setMediaType(string $mediaType): self
    {
        $mediaType = strtolower(trim($mediaType));
        $this->mediaType = $mediaType === self::TYPE_IMAGE ? self::TYPE_IMAGE : self::TYPE_IMAGE;

        return $this;
    }

    public function getStorageUrl(): string
    {
        return $this->storageUrl;
    }

    public function setStorageUrl(string $storageUrl): self
    {
        $this->storageUrl = mb_substr(trim($storageUrl), 0, 1024);

        return $this;
    }

    public function getThumbnailUrl(): ?string
    {
        return $this->thumbnailUrl;
    }

    public function setThumbnailUrl(?string $thumbnailUrl): self
    {
        $thumbnailUrl = trim((string) $thumbnailUrl);
        $this->thumbnailUrl = $thumbnailUrl === '' ? null : mb_substr($thumbnailUrl, 0, 1024);

        return $this;
    }

    public function getOriginalFilename(): ?string
    {
        return $this->originalFilename;
    }

    public function setOriginalFilename(?string $originalFilename): self
    {
        $originalFilename = trim((string) $originalFilename);
        $this->originalFilename = $originalFilename === '' ? null : mb_substr($originalFilename, 0, 255);

        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): self
    {
        if (!in_array($status, self::statuses(), true)) {
            throw new \InvalidArgumentException(sprintf('Unsupported review media status "%s".', $status));
        }

        $this->status = $status;

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return [
            'id' => $this->id,
            'media_type' => $this->mediaType,
            'storage_url' => $this->storageUrl,
            'thumbnail_url' => $this->thumbnailUrl,
            'status' => $this->status,
            'created_at' => $this->createdAt->format(DATE_ATOM),
        ];
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
