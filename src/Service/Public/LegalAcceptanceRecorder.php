<?php

declare(strict_types=1);

namespace App\Service\Public;

use App\Entity\Public\PublicUser;
use App\Entity\Public\PublicUserLegalAcceptance;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\Request;

final class LegalAcceptanceRecorder
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /**
     * @return array<int, PublicUserLegalAcceptance>
     */
    public function recordMany(PublicUser $user, array $documents, Request $request, string $source): array
    {
        $acceptances = [];
        foreach ($documents as $document) {
            if (!is_array($document)) {
                continue;
            }

            $slug = isset($document['slug']) && is_string($document['slug']) ? $document['slug'] : '';
            $versionLabel = isset($document['version_label']) && is_string($document['version_label']) ? $document['version_label'] : 'v1.0';
            if (trim($slug) === '') {
                continue;
            }

            $acceptances[] = $this->record($user, $slug, $versionLabel, $request, $source);
        }

        return $acceptances;
    }

    public function record(PublicUser $user, string $documentSlug, string $versionLabel, Request $request, string $source = 'explicit'): PublicUserLegalAcceptance
    {
        $documentSlug = trim($documentSlug);
        $versionLabel = trim($versionLabel) !== '' ? trim($versionLabel) : 'v1.0';

        $acceptance = $this->entityManager->getRepository(PublicUserLegalAcceptance::class)->findOneBy([
            'publicUser' => $user,
            'documentSlug' => $documentSlug,
            'versionLabel' => $versionLabel,
        ]);

        if ($acceptance instanceof PublicUserLegalAcceptance) {
            return $acceptance;
        }

        $acceptance = (new PublicUserLegalAcceptance())
            ->setPublicUser($user)
            ->setDocumentSlug($documentSlug)
            ->setVersionLabel($versionLabel)
            ->setSource($source)
            ->setIpHash($this->hashNullable($request->getClientIp()))
            ->setUserAgentHash($this->hashNullable($request->headers->get('User-Agent')));

        $this->entityManager->persist($acceptance);

        return $acceptance;
    }

    private function hashNullable(?string $value): ?string
    {
        $value = $value !== null ? trim($value) : '';
        if ($value === '') {
            return null;
        }

        return hash('sha256', $value);
    }
}
