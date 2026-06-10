<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Entity\Public\PublicUserLegalAcceptance;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class MeController extends AbstractController
{
    #[Route('/api/v1/me', name: 'public_api_me', methods: ['GET'])]
    public function __invoke(EntityManagerInterface $entityManager): JsonResponse
    {
        $user = $this->getUser();
        if (!$user instanceof PublicUser) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Unauthenticated.']], 401);
        }

        $legalAcceptances = $entityManager->getRepository(PublicUserLegalAcceptance::class)->findBy(
            ['publicUser' => $user],
            ['acceptedAt' => 'DESC']
        );

        return $this->json([
            'data' => [
                'id' => $user->getId(),
                'first_name' => $user->getFirstName(),
                'last_name' => $user->getLastName(),
                'email' => $user->getEmail(),
                'status' => $user->getStatus(),
                'registration_origin' => $user->getRegistrationOrigin(),
                'email_verified' => $user->getStatus() === 'active',
                'legal_acceptances' => array_map(
                    static fn (PublicUserLegalAcceptance $acceptance): array => [
                        'document_slug' => $acceptance->getDocumentSlug(),
                        'version_label' => $acceptance->getVersionLabel(),
                        'source' => $acceptance->getSource(),
                        'accepted_at' => $acceptance->getAcceptedAt()->format(DATE_ATOM),
                    ],
                    $legalAcceptances
                ),
            ],
            'meta' => [],
            'errors' => [],
        ]);
    }
}
