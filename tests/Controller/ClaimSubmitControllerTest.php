<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use App\Service\Claim\LocationClaimCoreClient;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Csrf\CsrfTokenManagerInterface;

class ClaimSubmitControllerTest extends WebTestCase
{
    public function testSubmitWithoutCsrfReturns403(): void
    {
        $client = static::createClient();
        
        $client->request('POST', '/claim/submit', [], [], [
            'CONTENT_TYPE' => 'application/json',
        ], json_encode(['confirm' => true]));
        
        $this->assertResponseStatusCodeSame(403);
    }

    public function testSubmitWithoutSessionReturns401(): void
    {
        $client = static::createClient();
        
        $mockCsrf = $this->createMock(CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        $client->request('POST', '/claim/submit', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => 'dummy-csrf'
        ], json_encode(['confirm' => true]));
        
        $this->assertResponseStatusCodeSame(401);
    }

    public function testSubmitWithoutLegalReturns422(): void
    {
        $client = static::createClient();
        $client->disableReboot();

        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->set('mi_monchis.claim_flow', [
            'claim_uuid' => 'claim-123',
            'claim_access_token' => 'token-456',
            'expires_at' => time() + 3600,
            'email_verified' => true
            // Missing legal_accepted
        ]);
        $session->start();
        $session->save();
        $client->getCookieJar()->set(new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId()));

        $mockCsrf = $this->createMock(CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        $client->request('POST', '/claim/submit', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => 'dummy-csrf'
        ], json_encode(['confirm' => true]));

        $this->assertResponseStatusCodeSame(422);
        $this->assertStringContainsString('Missing email verification or legal acceptance', $client->getResponse()->getContent());
    }

    public function testSubmitSuccessGeneratesIdempotencyKeyAndClearsSession(): void
    {
        $client = static::createClient();
        $client->disableReboot();

        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->set('mi_monchis.claim_flow', [
            'claim_uuid' => 'claim-123',
            'claim_access_token' => 'token-456',
            'expires_at' => time() + 3600,
            'email_verified' => true,
            'legal_accepted' => true,
            'legal_acceptance_reference' => 'terms_v1'
        ]);
        $session->start();
        $session->save();
        $client->getCookieJar()->set(new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId()));

        $mockCsrf = $this->createMock(CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        $mockCoreClient = $this->createMock(LocationClaimCoreClient::class);
        $mockCoreClient->expects($this->once())
            ->method('submitClaim')
            ->with('claim-123', $this->anything()) // Idempotency key generated
            ->willReturn([
                'status' => 'submitted',
                'public_reference' => 'FOLIO-XYZ'
            ]);
        static::getContainer()->set(LocationClaimCoreClient::class, $mockCoreClient);

        $client->request('POST', '/claim/submit', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => 'dummy-csrf'
        ], json_encode(['confirm' => true, 'claim_uuid' => 'fake-uuid'])); // fake-uuid should be ignored

        $this->assertResponseIsSuccessful();
        $json = json_decode($client->getResponse()->getContent(), true);
        $this->assertEquals('submitted', $json['status']);
        $this->assertArrayHasKey('redirect_url', $json);

        // Verify session was cleared of operational data but has result
        $updatedSession = $client->getRequest()->getSession();
        $this->assertNull($updatedSession->get('mi_monchis.claim_flow'));
        
        $result = $updatedSession->get('mi_monchis.claim_flow.result');
        $this->assertIsArray($result);
        $this->assertEquals('FOLIO-XYZ', $result['public_reference']);
    }

    public function testSubmitAlreadySubmittedTreatedAsSuccess(): void
    {
        $client = static::createClient();
        $client->disableReboot();

        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->set('mi_monchis.claim_flow', [
            'claim_uuid' => 'claim-123',
            'claim_access_token' => 'token-456',
            'expires_at' => time() + 3600,
            'email_verified' => true,
            'legal_accepted' => true,
            'legal_acceptance_reference' => 'terms_v1'
        ]);
        $session->start();
        $session->save();
        $client->getCookieJar()->set(new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId()));

        $mockCsrf = $this->createMock(CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        $mockCoreClient = $this->createMock(LocationClaimCoreClient::class);
        $mockCoreClient->expects($this->once())
            ->method('submitClaim')
            ->willThrowException(new \RuntimeException('claim_already_submitted', 409));
        static::getContainer()->set(LocationClaimCoreClient::class, $mockCoreClient);

        $client->request('POST', '/claim/submit', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => 'dummy-csrf'
        ], json_encode(['confirm' => true]));

        $this->assertResponseIsSuccessful();
        $json = json_decode($client->getResponse()->getContent(), true);
        $this->assertEquals('already_submitted', $json['status']);

        // Verify session is cleaned
        $updatedSession = $client->getRequest()->getSession();
        $this->assertNull($updatedSession->get('mi_monchis.claim_flow'));
        $this->assertNotNull($updatedSession->get('mi_monchis.claim_flow.result'));
    }

    public function testConfirmationPageDisplaysWithoutCoreCall(): void
    {
        $client = static::createClient();
        $client->disableReboot();

        // Seed session with result, no operational data
        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->set('mi_monchis.claim_flow.result', [
            'public_reference' => 'FOLIO-ABC',
            'status' => 'submitted',
            'submitted_at' => '2026-06-18T20:00:00Z'
        ]);
        $session->start();
        $session->save();
        $client->getCookieJar()->set(new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId()));

        // We don't mock CoreClient because it shouldn't be called

        $client->request('GET', '/claim/confirmation');
        
        $this->assertResponseIsSuccessful();
        $this->assertStringContainsString('FOLIO-ABC', $client->getResponse()->getContent());
        $this->assertStringNotContainsString('claim-uuid-123', $client->getResponse()->getContent()); // Security check
        
        // Check PRG header
        $this->assertStringContainsString('no-store', $client->getResponse()->headers->get('Cache-Control'));
    }

    public function testConfirmationWithoutResultShowsFallback(): void
    {
        $client = static::createClient();
        
        $client->request('GET', '/claim/confirmation');
        
        $this->assertResponseIsSuccessful();
        // Since state is expired_confirmation, the twig will render something
        // Just verify it doesn't crash and returns 200
    }
}
