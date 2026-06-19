<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class ClaimFlowSecurityTest extends WebTestCase
{
    public function testOtpConfirmationStoresTokenServerSideAndDoesNotLeakIt(): void
    {
        $client = static::createClient();
        
        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->set('mi_monchis.claim_flow', ['claim_uuid' => 'dummy-claim-uuid']);
        $session->save();
        
        $cookie = new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId());
        $client->getCookieJar()->set($cookie);

        // 2. Mock the Core API Client to simulate a successful OTP confirmation
        // Since we are doing a functional test on the controller, we can mock the service.
        $mockCoreClient = $this->createMock(\App\Service\Claim\LocationClaimCoreClient::class);
        $mockCoreClient->expects($this->once())
            ->method('confirmOtp')
            ->with('dummy-claim-uuid', '123456')
            ->willReturn([
                'claim_uuid' => 'dummy-claim-uuid',
                'access_token' => 'super-secret-server-side-token',
                'expires_in' => 7200,
            ]);

        // Inject the mock into the container
        static::getContainer()->set(\App\Service\Claim\LocationClaimCoreClient::class, $mockCoreClient);

        // Mock CSRF token manager to bypass CSRF check
        $mockCsrf = $this->createMock(\Symfony\Component\Security\Csrf\CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        // 3. Make the POST request to confirm OTP
        $client->request('POST', '/claim/otp/confirm', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => 'dummy-csrf'
        ], json_encode(['code' => '123456']));

        // 4. Assert response is successful
        $this->assertResponseIsSuccessful();
        $responseContent = $client->getResponse()->getContent();
        
        // 5. SECURITY ASSERTION: Token MUST NOT be in the response body
        $this->assertStringNotContainsString('super-secret-server-side-token', $responseContent, 'CRITICAL SECURITY FAILURE: Token leaked in JSON response!');

        // 6. SECURITY ASSERTION: Token MUST NOT be in any response cookies
        $cookies = $client->getResponse()->headers->getCookies();
        foreach ($cookies as $responseCookie) {
            $this->assertStringNotContainsString('super-secret-server-side-token', $responseCookie->getValue(), 'CRITICAL SECURITY FAILURE: Token leaked in cookie!');
        }

        // 7. ASSERTION: Session ID MUST be regenerated
        $newSessionId = $client->getRequest()->getSession()->getId();
        $this->assertNotEquals($session->getId(), $newSessionId, 'Session ID was not regenerated after elevation!');

        // 8. SECURITY ASSERTION: Token MUST be securely stored in the server-side session
        $sessionData = $client->getRequest()->getSession()->get('mi_monchis.claim_flow');
        $this->assertArrayHasKey('claim_access_token', $sessionData);
        $this->assertEquals('super-secret-server-side-token', $sessionData['claim_access_token'], 'Token was not stored in server session!');
        $this->assertArrayHasKey('expires_at', $sessionData);
    }
}
