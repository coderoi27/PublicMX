<?php

declare(strict_types=1);

namespace App\Controller\Claim;

use App\Service\Claim\ClaimFlowSessionManager;
use App\Service\Claim\LocationClaimCoreClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Csrf\CsrfTokenManagerInterface;
use Symfony\Component\Security\Csrf\CsrfToken;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

#[Route('/claim')]
final class ClaimFlowController extends AbstractController
{
    #[Route('/start', name: 'app_claim_start', methods: ['POST'])]
    public function start(
        Request $request,
        ClaimFlowSessionManager $sessionManager,
        LocationClaimCoreClient $coreClient,
        CsrfTokenManagerInterface $csrfTokenManager
    ): JsonResponse {
        $csrfToken = new CsrfToken('claim_flow', $request->headers->get('X-CSRF-TOKEN', ''));
        if (!$csrfTokenManager->isTokenValid($csrfToken)) {
            return $this->json(['error' => 'Invalid CSRF token'], 403);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $placeId = $payload['place_id'] ?? null;

        if (!$placeId) {
            return $this->json(['error' => 'Missing place_id'], 400);
        }

        try {
            // Core creates draft and returns basic data
            $result = $coreClient->createDraft($placeId, []);
            
            // Start local session with the UUID
            $sessionManager->startClaim($result['claim_uuid']);
            $sessionManager->updateProgress($result['last_completed_step'] ?? 'started', $result['status'] ?? 'draft');

            return $this->json([
                'success' => true,
                'claim_uuid' => $result['claim_uuid']
            ]);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], $e->getCode() ?: 422);
        }
    }

    #[Route('/progress/save', name: 'app_claim_progress_save', methods: ['POST'])]
    public function saveProgress(
        Request $request,
        ClaimFlowSessionManager $sessionManager,
        LocationClaimCoreClient $coreClient,
        CsrfTokenManagerInterface $csrfTokenManager,
        #[Autowire('%app.claim_legal_acceptance_reference%')] string $canonicalLegalRef
    ): JsonResponse {
        $csrfToken = new CsrfToken('claim_flow', $request->headers->get('X-CSRF-TOKEN', ''));
        if (!$csrfTokenManager->isTokenValid($csrfToken)) {
            return $this->json(['error' => 'Invalid CSRF token'], 403);
        }

        $claimUuid = $sessionManager->getClaimUuid();
        if (!$claimUuid) {
            return $this->json(['error' => 'No active claim in session'], 401); // 401 because session is needed
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        
        // Whitelist explícita para progreso
        $allowedFields = [
            'claimant_name',
            'claimant_role',
            'email',
            'phone',
            'business_phone',
            'proposed_name',
            'proposed_address',
            'last_completed_step'
        ];
        
        $safePayload = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $payload)) {
                $safePayload[$field] = $payload[$field];
            }
        }

        // If browser says it accepted legal terms, we inject the canonical reference
        if (isset($payload['legal_accepted']) && $payload['legal_accepted'] === true) {
            $safePayload['legal_acceptance_reference'] = $canonicalLegalRef;
        }

        try {
            $result = $coreClient->updateProgress($claimUuid, $safePayload);
            
            $sessionManager->updateProgress($result['last_completed_step'] ?? '', $result['status'] ?? 'draft');
            if (isset($safePayload['legal_acceptance_reference'])) {
                $sessionManager->markLegalAccepted($canonicalLegalRef);
            }

            return $this->json(['success' => true, 'data' => $result]);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], $e->getCode() ?: 422);
        }
    }

    #[Route('/continue', name: 'app_claim_continue', methods: ['GET'])]
    public function continue(
        ClaimFlowSessionManager $sessionManager,
        LocationClaimCoreClient $coreClient,
        CsrfTokenManagerInterface $csrfTokenManager
    ): Response {
        // CSRF for forms inside Twig
        $csrfToken = $csrfTokenManager->getToken('claim_flow')->getValue();

        // If there's a result, it means it was just submitted
        $result = $sessionManager->getSubmitResult();
        if ($result) {
            return $this->render('claim/claim.html.twig', [
                'state' => 'submitted',
                'csrf_token' => $csrfToken,
                'result' => $result
            ]);
        }

        $claimUuid = $sessionManager->getClaimUuid();
        if (!$claimUuid) {
            // No active session. They should go back to home or a local page to start
            return $this->redirectToRoute('app_home'); // or similar
        }

        // Fetch full claim data to render the summary and steps correctly server-side
        try {
            $claimData = $coreClient->getClaim($claimUuid);
        } catch (\RuntimeException $e) {
            $claimData = [];
        }

        // Render the wizard structure (A5-P5)
        return $this->render('claim/claim.html.twig', [
            'state' => 'wizard',
            'csrf_token' => $csrfToken,
            'claim_uuid' => $claimUuid,
            'email_verified' => $sessionManager->isEmailVerified(),
            'claim_status' => $sessionManager->getStatus(),
            'has_token' => $sessionManager->isOperationalSessionValid(),
            'claim_data' => $claimData
        ]);
    }

    #[Route('/confirmation', name: 'app_claim_confirmation', methods: ['GET'])]
    public function confirmation(ClaimFlowSessionManager $sessionManager): Response
    {
        $result = $sessionManager->getSubmitResult();
        
        if (!$result) {
            // Fallback if accessed without a valid recent result (e.g., session expired completely)
            return $this->render('claim/claim.html.twig', [
                'state' => 'expired_confirmation'
            ]);
        }

        $response = $this->render('claim/claim.html.twig', [
            'state' => 'submitted',
            'result' => $result
        ]);

        // Post/Redirect/Get: prevent caching of confirmation page
        $response->headers->set('Cache-Control', 'no-store, private');

        return $response;
    }
}
