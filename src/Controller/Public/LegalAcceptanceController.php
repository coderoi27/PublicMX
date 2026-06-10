<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Entity\Public\PublicUserLegalAcceptance;
use App\Service\Public\LegalAcceptanceRecorder;
use App\Service\Public\LegalDocumentClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final class LegalAcceptanceController extends AbstractController
{
    #[Route('/api/v1/me/legal-acceptances', name: 'public_api_legal_acceptances_collection', methods: ['GET', 'POST'])]
    public function collection(
        Request $request,
        EntityManagerInterface $entityManager,
        LegalDocumentClient $legalDocumentClient,
        LegalAcceptanceRecorder $legalAcceptanceRecorder,
    ): JsonResponse {
        $user = $this->getUser();
        if (!$user instanceof PublicUser) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Unauthenticated.']], 401);
        }

        if ($request->isMethod('GET')) {
            return $this->json([
                'data' => array_map(
                    static fn (PublicUserLegalAcceptance $acceptance): array => self::serialize($acceptance),
                    $entityManager->getRepository(PublicUserLegalAcceptance::class)->findBy(['publicUser' => $user], ['acceptedAt' => 'DESC'])
                ),
                'meta' => [],
                'errors' => [],
            ]);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Payload JSON inválido.']], 400);
        }

        $documentSlug = isset($payload['document_slug']) && is_string($payload['document_slug']) ? trim($payload['document_slug']) : '';
        if ($documentSlug === '') {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['document_slug es obligatorio.']], 422);
        }

        $document = $legalDocumentClient->fetchDocument($documentSlug);
        if ($document === null) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['Documento legal no encontrado.']], 404);
        }

        $versionLabel = isset($payload['version_label']) && is_string($payload['version_label']) && trim($payload['version_label']) !== ''
            ? trim($payload['version_label'])
            : (is_string($document['version_label'] ?? null) ? $document['version_label'] : 'v1.0');

        $acceptance = $legalAcceptanceRecorder->record(
            $user,
            $documentSlug,
            $versionLabel,
            $request,
            isset($payload['source']) && is_string($payload['source']) ? $payload['source'] : 'explicit'
        );

        $entityManager->flush();

        return $this->json([
            'data' => self::serialize($acceptance),
            'meta' => [],
            'errors' => [],
        ], 201);
    }

    private static function serialize(PublicUserLegalAcceptance $acceptance): array
    {
        return [
            'document_slug' => $acceptance->getDocumentSlug(),
            'version_label' => $acceptance->getVersionLabel(),
            'source' => $acceptance->getSource(),
            'accepted_at' => $acceptance->getAcceptedAt()->format(DATE_ATOM),
        ];
    }
}
