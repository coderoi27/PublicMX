<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use App\Service\Claim\LocationClaimCoreClient;
use Symfony\Component\HttpFoundation\Session\SessionInterface;
use Symfony\Component\Security\Csrf\CsrfTokenManagerInterface;

final class ClaimFlowIntegrationTest extends WebTestCase
{
    public function testCompleteSessionFlow(): void
    {
        $client = static::createClient();
        $client->disableReboot();

        // 0. Initialize session
        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->start();
        $session->save();
        $client->getCookieJar()->set(new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId()));

        $mockCsrf = $this->createMock(CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        $csrfToken = 'dummy-csrf';

        // We will mock the Core Client to simulate the whole backend behavior
        $mockCoreClient = $this->createMock(LocationClaimCoreClient::class);

        static::getContainer()->set(LocationClaimCoreClient::class, $mockCoreClient);

        // 1. Crear Draft
        $mockCoreClient->expects($this->once())
            ->method('createDraft')
            ->with('google-place-123')
            ->willReturn([
                'claim_uuid' => 'test-claim-uuid',
                'status' => 'draft',
                'last_completed_step' => 'started'
            ]);

        $client->request('POST', '/claim/start', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => $csrfToken
        ], json_encode(['place_id' => 'google-place-123']));

        $this->assertResponseIsSuccessful();
        
        // Assert session has claim_uuid
        $session = $client->getRequest()->getSession();
        $sessionData = $session->get('mi_monchis.claim_flow');
        $this->assertEquals('test-claim-uuid', $sessionData['claim_uuid']);
        $this->assertArrayNotHasKey('claim_access_token', $sessionData); // No token yet

        // 2. Guardar progreso
        $mockCoreClient->expects($this->once())
            ->method('updateProgress')
            ->with('test-claim-uuid', ['claimant_name' => 'John Doe'])
            ->willReturn([
                'status' => 'draft',
                'last_completed_step' => 'claimant'
            ]);

        $client->request('POST', '/claim/progress/save', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => $csrfToken
        ], json_encode(['claimant_name' => 'John Doe']));

        $this->assertResponseIsSuccessful();
        $sessionData = $client->getRequest()->getSession()->get('mi_monchis.claim_flow');
        $this->assertEquals('claimant', $sessionData['last_completed_step']);

        // 3. Solicitar OTP
        $mockCoreClient->expects($this->once())
            ->method('requestOtp')
            ->with('test-claim-uuid')
            ->willReturn(['success' => true]);

        $client->request('POST', '/claim/otp/request', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => $csrfToken
        ]);

        $this->assertResponseIsSuccessful();

        // 4. Confirmar OTP
        $mockCoreClient->expects($this->once())
            ->method('confirmOtp')
            ->with('test-claim-uuid', '123456')
            ->willReturn([
                'claim_uuid' => 'test-claim-uuid',
                'access_token' => 'SECURITY_TEST_TOKEN_DO_NOT_EXPOSE',
                'expires_in' => 7200
            ]);

        $sessionIdBeforeOtp = $client->getRequest()->getSession()->getId();

        $client->request('POST', '/claim/otp/confirm', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => $csrfToken
        ], json_encode(['code' => '123456']));

        $this->assertResponseIsSuccessful();
        
        // Assert token is NOT leaked
        $this->assertStringNotContainsString('SECURITY_TEST_TOKEN_DO_NOT_EXPOSE', $client->getResponse()->getContent());
        foreach ($client->getResponse()->headers->getCookies() as $cookie) {
            $this->assertStringNotContainsString('SECURITY_TEST_TOKEN_DO_NOT_EXPOSE', $cookie->getValue());
        }

        // 5. Regenerar sesión
        $sessionIdAfterOtp = $client->getRequest()->getSession()->getId();
        $this->assertNotEquals($sessionIdBeforeOtp, $sessionIdAfterOtp, 'Session ID should have been regenerated');
        
        $sessionData = $client->getRequest()->getSession()->get('mi_monchis.claim_flow');
        $this->assertEquals('SECURITY_TEST_TOKEN_DO_NOT_EXPOSE', $sessionData['claim_access_token']);

        // 6. Recargar /claim/continue -> recuperar el paso correcto
        $client->request('GET', '/claim/continue');
        $this->assertResponseIsSuccessful();
        // Since we don't have the twig yet, it will fail to render unless we create a dummy twig or just assert status 200.
        // Wait, it will try to render 'claim/claim.html.twig'. We should probably create it.

        // 7. Reanudar desde enlace en una nueva sesión
        // Simulate clicking a resume link on a completely new client/session
        static::ensureKernelShutdown();
        $newClient = static::createClient();
        
        // Re-mock core client for new container
        $mockCoreClientNew = $this->createMock(LocationClaimCoreClient::class);
        static::getContainer()->set(LocationClaimCoreClient::class, $mockCoreClientNew);

        $mockCoreClientNew->expects($this->once())
            ->method('resolveResumeToken')
            ->with('valid-resume-token-abc')
            ->willReturn([
                'claim_uuid' => 'test-claim-uuid',
                'access_token' => 'NEW_SECURITY_TEST_TOKEN',
                'expires_in' => 7200
            ]);

        $newClient->request('GET', '/claim/resume/valid-resume-token-abc');
        
        $this->assertResponseRedirects('/claim/continue');
        
        $newSessionData = $newClient->getRequest()->getSession()->get('mi_monchis.claim_flow');
        $this->assertEquals('test-claim-uuid', $newSessionData['claim_uuid']);
        $this->assertEquals('NEW_SECURITY_TEST_TOKEN', $newSessionData['claim_access_token']);
        
        // Assert security headers on resume redirect
        $this->assertEquals('no-referrer', $newClient->getResponse()->headers->get('Referrer-Policy'));
    }
}
