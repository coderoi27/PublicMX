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

#[Route('/claim/otp')]
final class ClaimOtpController extends AbstractController
{
    #[Route('/request', name: 'app_claim_otp_request', methods: ['POST'])]
    public function requestOtp(
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
        if (!$claimUuid) {
            return $this->json(['error' => 'No active claim in session'], 400);
        }

        try {
            $result = $coreClient->requestOtp($claimUuid);
            return $this->json(['success' => true]);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], $e->getCode() ?: 422);
        }
    }

    #[Route('/confirm', name: 'app_claim_otp_confirm', methods: ['POST'])]
    public function confirm(
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
        if (!$claimUuid) {
            return $this->json(['error' => 'No active claim in session'], 400);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $code = $payload['code'] ?? '';

        if (empty($code)) {
            return $this->json(['error' => 'Code is required'], 400);
        }

        try {
            // This will return an array: ['claim_uuid' => ..., 'access_token' => ..., 'expires_in' => ...]
            $result = $coreClient->confirmOtp($claimUuid, $code);

            // Elevate session (saves token server-side and regenerates session ID)
            $sessionManager->elevateWithAccessToken(
                $result['access_token'],
                $result['expires_in'],
                true // email verified
            );

            // Return sanitized response (NO TOKEN EXPOSED)
            return $this->json([
                'success' => true,
                'message' => 'OTP confirmed successfully',
                'status' => 'email_verified'
            ]);

        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], $e->getCode() ?: 422);
        }
    }
}
