<?php

declare(strict_types=1);

namespace App\Entity\Public;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'public_user_legal_acceptances')]
#[ORM\UniqueConstraint(name: 'uniq_public_user_legal_version', columns: ['public_user_id', 'document_slug', 'version_label'])]
class PublicUserLegalAcceptance
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: PublicUser::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private PublicUser $publicUser;

    #[ORM\Column(length: 120)]
    private string $documentSlug;

    #[ORM\Column(length: 40)]
    private string $versionLabel;

    #[ORM\Column(length: 32)]
    private string $source = 'explicit';

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $ipHash = null;

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $userAgentHash = null;

    #[ORM\Column]
    private \DateTimeImmutable $acceptedAt;

    public function __construct()
    {
        $this->acceptedAt = new \DateTimeImmutable();
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

    public function getDocumentSlug(): string
    {
        return $this->documentSlug;
    }

    public function setDocumentSlug(string $documentSlug): self
    {
        $this->documentSlug = trim($documentSlug);

        return $this;
    }

    public function getVersionLabel(): string
    {
        return $this->versionLabel;
    }

    public function setVersionLabel(string $versionLabel): self
    {
        $this->versionLabel = trim($versionLabel) !== '' ? trim($versionLabel) : 'v1.0';

        return $this;
    }

    public function getSource(): string
    {
        return $this->source;
    }

    public function setSource(string $source): self
    {
        $source = trim($source);
        $this->source = $source !== '' ? mb_substr($source, 0, 32) : 'explicit';

        return $this;
    }

    public function getIpHash(): ?string
    {
        return $this->ipHash;
    }

    public function setIpHash(?string $ipHash): self
    {
        $this->ipHash = $ipHash;

        return $this;
    }

    public function getUserAgentHash(): ?string
    {
        return $this->userAgentHash;
    }

    public function setUserAgentHash(?string $userAgentHash): self
    {
        $this->userAgentHash = $userAgentHash;

        return $this;
    }

    public function getAcceptedAt(): \DateTimeImmutable
    {
        return $this->acceptedAt;
    }

    public function setAcceptedAt(\DateTimeImmutable $acceptedAt): self
    {
        $this->acceptedAt = $acceptedAt;

        return $this;
    }
}
