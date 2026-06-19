<?php

declare(strict_types=1);

namespace App\Controller\Claim;

use App\Service\Claim\ClaimFlowSessionManager;
use App\Service\Claim\LocationClaimCoreClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/claim/resume')]
final class ClaimResumeController extends AbstractController
{
    #[Route('/{token}', name: 'app_claim_resume', methods: ['GET'])]
    public function resume(
        string $token,
        ClaimFlowSessionManager $sessionManager,
        LocationClaimCoreClient $coreClient
    ): Response {
        // Clear any previous operational context
        $sessionManager->clearOperationalContext();

        try {
            // Call core server-to-server to resolve token
            $result = $coreClient->resolveResumeToken($token);

            // Re-start claim flow
            $sessionManager->startClaim($result['claim_uuid']);
            
            // Elevate session directly since resuming implies they confirmed identity via link
            $sessionManager->elevateWithAccessToken(
                $result['access_token'],
                $result['expires_in'],
                true
            );

            // Redirect cleanly to the continue page
            $response = $this->redirectToRoute('app_claim_continue', [], Response::HTTP_SEE_OTHER);
            
            // Apply security headers
            $response->headers->set('Referrer-Policy', 'no-referrer');
            $response->headers->set('Cache-Control', 'no-store, private');
            $response->headers->set('Pragma', 'no-cache');

            return $response;
            
        } catch (\RuntimeException $e) {
            // Clean any context just in case
            $sessionManager->clearOperationalContext();
            
            // Render a neutral error page (A5-P4 requirement)
            $response = $this->render('claim/resume_error.html.twig', [
                'error' => 'invalid_or_expired_link'
            ]);
            
            // Apply security headers
            $response->headers->set('Referrer-Policy', 'no-referrer');
            $response->headers->set('Cache-Control', 'no-store, private');
            $response->headers->set('Pragma', 'no-cache');
            
            return $response;
        }
    }
}
