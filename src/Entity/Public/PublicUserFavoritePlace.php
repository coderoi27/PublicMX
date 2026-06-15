<?php

declare(strict_types=1);

namespace App\Entity\Public;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'public_user_favorite_places')]
#[ORM\UniqueConstraint(name: 'uniq_public_user_location', columns: ['public_user_id', 'location_id'])]
#[ORM\UniqueConstraint(name: 'uniq_public_user_favorite_key', columns: ['public_user_id', 'favorite_key'])]
class PublicUserFavoritePlace
{
    public const SOURCE_CANONICAL = 'canonical';
    public const SOURCE_GOOGLE_PLACES = 'google_places';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: PublicUser::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private PublicUser $publicUser;

    #[ORM\Column(nullable: true)]
    private ?int $locationId = null;

    #[ORM\Column(length: 40)]
    private string $sourceType = self::SOURCE_CANONICAL;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $externalSourceKey = null;

    #[ORM\Column(length: 320)]
    private string $favoriteKey = '';

    #[ORM\Column(length: 180, nullable: true)]
    private ?string $snapshotName = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $snapshotAddress = null;

    #[ORM\Column(length: 1024, nullable: true)]
    private ?string $snapshotPhotoUrl = null;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $snapshotCategorySlug = null;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $snapshotCategoryName = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 7, nullable: true)]
    private ?string $snapshotLatitude = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 7, nullable: true)]
    private ?string $snapshotLongitude = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setPublicUser(PublicUser $publicUser): self
    {
        $this->publicUser = $publicUser;

        return $this;
    }

    public function setLocationId(?int $locationId): self
    {
        $this->locationId = $locationId;
        if ($locationId !== null && $this->favoriteKey === '') {
            $this->favoriteKey = self::favoriteKeyFor(self::SOURCE_CANONICAL, (string) $locationId);
        }

        return $this;
    }

    public function getLocationId(): ?int
    {
        return $this->locationId;
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

    public function getExternalSourceKey(): ?string
    {
        return $this->externalSourceKey;
    }

    public function setExternalSourceKey(?string $externalSourceKey): self
    {
        $this->externalSourceKey = $externalSourceKey;

        return $this;
    }

    public function getFavoriteKey(): string
    {
        if ($this->favoriteKey !== '') {
            return $this->favoriteKey;
        }

        if ($this->locationId !== null) {
            return self::favoriteKeyFor(self::SOURCE_CANONICAL, (string) $this->locationId);
        }

        return self::favoriteKeyFor($this->sourceType, (string) $this->externalSourceKey);
    }

    public function setFavoriteKey(string $favoriteKey): self
    {
        $this->favoriteKey = $favoriteKey;

        return $this;
    }

    public function setSnapshot(
        ?string $name,
        ?string $address,
        ?string $photoUrl,
        ?string $categorySlug,
        ?string $categoryName,
        mixed $latitude,
        mixed $longitude,
    ): self {
        $this->snapshotName = $this->cleanString($name, 180);
        $this->snapshotAddress = $this->cleanString($address, 255);
        $this->snapshotPhotoUrl = $this->cleanString($photoUrl, 1024);
        $this->snapshotCategorySlug = $this->cleanString($categorySlug, 120);
        $this->snapshotCategoryName = $this->cleanString($categoryName, 120);
        $this->snapshotLatitude = $this->decimalString($latitude);
        $this->snapshotLongitude = $this->decimalString($longitude);

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return [
            'id' => $this->id,
            'favorite_key' => $this->getFavoriteKey(),
            'source_type' => $this->sourceType,
            'location_id' => $this->locationId,
            'external_source_key' => $this->externalSourceKey,
            'snapshot' => [
                'name' => $this->snapshotName,
                'address' => $this->snapshotAddress,
                'photo_url' => $this->snapshotPhotoUrl,
                'category_slug' => $this->snapshotCategorySlug,
                'category_name' => $this->snapshotCategoryName,
                'lat' => $this->snapshotLatitude !== null ? (float) $this->snapshotLatitude : null,
                'lng' => $this->snapshotLongitude !== null ? (float) $this->snapshotLongitude : null,
            ],
            'created_at' => $this->createdAt->format(DATE_ATOM),
        ];
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public static function favoriteKeyFor(string $sourceType, string $identity): string
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

    private function cleanString(?string $value, int $maxLength): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return mb_substr($value, 0, $maxLength);
    }

    private function decimalString(mixed $value): ?string
    {
        if (!is_numeric($value)) {
            return null;
        }

        return number_format((float) $value, 7, '.', '');
    }
}
