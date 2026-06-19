<?php

declare(strict_types=1);

namespace App\Controller\Claim;

use App\Service\Claim\ClaimFlowSessionManager;
use App\Service\Claim\LocationClaimCoreClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Csrf\CsrfTokenManagerInterface;
use Symfony\Component\Security\Csrf\CsrfToken;

#[Route('/claim/evidence')]
final class ClaimEvidenceController extends AbstractController
{
    #[Route('/prepare', name: 'app_claim_evidence_prepare', methods: ['POST'])]
    public function prepare(
        Request $request,
        ClaimFlowSessionManager $sessionManager,
        LocationClaimCoreClient $coreClient,
        CsrfTokenManagerInterface $csrfTokenManager
    ): JsonResponse {
        $csrfToken = new CsrfToken('claim_flow', $request->headers->get('X-CSRF-TOKEN', ''));
        if (!$csrfTokenManager->isTokenValid($csrfToken)) {
            return $this->json(['error' => 'Invalid CSRF token'], 403);
        }

        $claimUuid = $sessionManager->getClaimUuid();
        if (!$claimUuid || !$sessionManager->isOperationalSessionValid()) {
            return $this->json(['error' => 'Authentication required'], 401);
        }

        $payload = json_decode($request->getContent(), true) ?? [];

        try {
            // Core will return presigned URL, evidence_id, required_headers, etc.
            $result = $coreClient->prepareEvidenceUpload($claimUuid, $payload);
            return $this->json(['success' => true, 'data' => $result]);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], $e->getCode() ?: 422);
        }
    }

    #[Route('/complete', name: 'app_claim_evidence_complete', methods: ['POST'])]
    public function complete(
        Request $request,
        ClaimFlowSessionManager $sessionManager,
        LocationClaimCoreClient $coreClient,
        CsrfTokenManagerInterface $csrfTokenManager
    ): JsonResponse {
        $csrfToken = new CsrfToken('claim_flow', $request->headers->get('X-CSRF-TOKEN', ''));
        if (!$csrfTokenManager->isTokenValid($csrfToken)) {
            return $this->json(['error' => 'Invalid CSRF token'], 403);
        }

        $claimUuid = $sessionManager->getClaimUuid();
        if (!$claimUuid || !$sessionManager->isOperationalSessionValid()) {
            return $this->json(['error' => 'Authentication required'], 401);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $evidenceId = $payload['evidence_id'] ?? null;

        if (!$evidenceId) {
            return $this->json(['error' => 'Missing evidence_id'], 400);
        }

        try {
            $result = $coreClient->completeEvidenceUpload($claimUuid, $evidenceId, $payload['etag'] ?? null);
            return $this->json(['success' => true, 'data' => $result]);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], $e->getCode() ?: 422);
        }
    }
}
