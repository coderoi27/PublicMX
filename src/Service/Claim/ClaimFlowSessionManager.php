<?php

declare(strict_types=1);

namespace App\Service\Claim;

use Symfony\Component\HttpFoundation\RequestStack;

final class ClaimFlowSessionManager
{
    private RequestStack $requestStack;
    private const SESSION_KEY = 'mi_monchis.claim_flow';

    public function __construct(RequestStack $requestStack)
    {
        $this->requestStack = $requestStack;
    }

    private function getSessionData(): array
    {
        $session = $this->requestStack->getSession();
        return $session->get(self::SESSION_KEY, []);
    }

    private function setSessionData(array $data): void
    {
        $session = $this->requestStack->getSession();
        $session->set(self::SESSION_KEY, $data);
    }

    public function startClaim(string $claimUuid): void
    {
        $data = $this->getSessionData();
        $data['claim_uuid'] = $claimUuid;
        $this->setSessionData($data);
    }

    public function elevateWithAccessToken(string $accessToken, int $expiresInSeconds, bool $emailVerified): void
    {
        $data = $this->getSessionData();
        $data['claim_access_token'] = $accessToken;
        $data['expires_at'] = (new \DateTimeImmutable())->modify(sprintf('+%d seconds', $expiresInSeconds))->getTimestamp();
        $data['email_verified'] = $emailVerified;
        
        $this->setSessionData($data);

        // Regenerate session ID to prevent session fixation after privilege elevation
        $this->requestStack->getSession()->migrate(true);
    }

    public function updateProgress(string $lastCompletedStep, string $status): void
    {
        $data = $this->getSessionData();
        $data['last_completed_step'] = $lastCompletedStep;
        $data['claim_status'] = $status;
        $this->setSessionData($data);
    }

    public function markEmailVerified(): void
    {
        $data = $this->getSessionData();
        $data['email_verified'] = true;
        $this->setSessionData($data);
    }

    public function markLegalAccepted(string $reference): void
    {
        $data = $this->getSessionData();
        $data['legal_accepted'] = true;
        $data['legal_acceptance_reference'] = $reference;
        $this->setSessionData($data);
    }

    public function getLegalAcceptanceReference(): ?string
    {
        return $this->getSessionData()['legal_acceptance_reference'] ?? null;
    }

    public function getClaimUuid(): ?string
    {
        return $this->getSessionData()['claim_uuid'] ?? null;
    }

    public function getAccessToken(): ?string
    {
        if (!$this->isOperationalSessionValid()) {
            return null;
        }

        return $this->getSessionData()['claim_access_token'] ?? null;
    }

    public function isOperationalSessionValid(): bool
    {
        $data = $this->getSessionData();
        
        if (!isset($data['claim_access_token']) || !isset($data['expires_at'])) {
            return false;
        }

        if (time() > $data['expires_at']) {
            $this->clearOperationalContext(); // Token expired
            return false;
        }

        return true;
    }

    public function isEmailVerified(): bool
    {
        return $this->getSessionData()['email_verified'] ?? false;
    }

    public function getStatus(): ?string
    {
        return $this->getSessionData()['claim_status'] ?? null;
    }

    public function clearOperationalContext(): void
    {
        $session = $this->requestStack->getSession();
        $session->remove(self::SESSION_KEY);
    }

    public function submitSuccess(string $claimUuid, string $status, string $publicReference): void
    {
        $session = $this->requestStack->getSession();
        $session->remove(self::SESSION_KEY);

        // Retain only safe public result
        $session->set(self::SESSION_KEY . '.result', [
            'public_reference' => $publicReference,
            'status' => $status,
            'submitted_at' => (new \DateTimeImmutable())->format('c'),
            // we could add confirmation_email_masked if we had it, but for now we just use safe fields
        ]);
    }
    
    public function getSubmitResult(): ?array
    {
        $session = $this->requestStack->getSession();
        return $session->get(self::SESSION_KEY . '.result');
    }

    public function getOrCreateSubmitIdempotencyKey(): string
    {
        $data = $this->getSessionData();
        if (!isset($data['submit_idempotency_key'])) {
            $data['submit_idempotency_key'] = bin2hex(random_bytes(16));
            $this->setSessionData($data);
        }
        return $data['submit_idempotency_key'];
    }

    public function clearSubmitIdempotencyKey(): void
    {
        $data = $this->getSessionData();
        unset($data['submit_idempotency_key']);
        $this->setSessionData($data);
    }
}
