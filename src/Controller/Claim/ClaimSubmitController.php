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

#[Route('/claim')]
final class ClaimSubmitController extends AbstractController
{
    #[Route('/submit', name: 'app_claim_submit', methods: ['POST'])]
    public function submit(
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

        if (!$sessionManager->isEmailVerified() || !$sessionManager->getLegalAcceptanceReference()) {
            return $this->json(['error' => 'Missing email verification or legal acceptance'], 422);
        }

        $idempotencyKey = $sessionManager->getOrCreateSubmitIdempotencyKey();

        try {
            $result = $coreClient->submitClaim($claimUuid, $idempotencyKey);
            
            $status = $result['status'] ?? 'submitted';
            $publicReference = $result['public_reference'] ?? 'PENDING-' . substr($claimUuid, 0, 8);

            // If it's already submitted or newly submitted, we treat it as success
            $sessionManager->submitSuccess($claimUuid, $status, $publicReference);

            return $this->json([
                'status' => $status,
                'redirect_url' => $this->generateUrl('app_claim_confirmation')
            ]);
        } catch (\RuntimeException $e) {
            $code = $e->getCode();
            // If core returns already submitted as 409
            if ($code === 409 && str_contains($e->getMessage(), 'already_submitted')) {
                // In alpha, maybe we don't have public_reference if it's an error response
                // but if we do, we could parse it. For now, fallback reference.
                $sessionManager->submitSuccess($claimUuid, 'already_submitted', 'N/A');
                return $this->json([
                    'status' => 'already_submitted',
                    'redirect_url' => $this->generateUrl('app_claim_confirmation')
                ]);
            }

            return $this->json(['error' => $e->getMessage()], $code ?: 422);
        }
    }
}
