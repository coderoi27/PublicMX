<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use App\Service\Claim\LocationClaimCoreClient;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Csrf\CsrfTokenManagerInterface;

class ClaimEvidenceControllerTest extends WebTestCase
{
    public function testPrepareUploadWithoutCsrf(): void
    {
        $client = static::createClient();
        
        $client->request('POST', '/claim/evidence/prepare', [], [], [
            'CONTENT_TYPE' => 'application/json',
        ], json_encode([
            'file_name' => 'test.mp4',
            'mime_type' => 'video/mp4',
            'size_bytes' => 1024
        ]));
        
        $this->assertResponseStatusCodeSame(403);
    }

    public function testPrepareUploadSuccess(): void
    {
        $client = static::createClient();
        $client->disableReboot();
        
        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->set('mi_monchis.claim_flow', [
            'claim_uuid' => 'claim-uuid-123',
            'claim_access_token' => 'token-456',
            'expires_at' => time() + 3600
        ]);
        $session->start();
        $session->save();
        $client->getCookieJar()->set(new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId()));

        $mockCsrf = $this->createMock(CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        $mockCoreClient = $this->createMock(LocationClaimCoreClient::class);
        $mockCoreClient->expects($this->once())
            ->method('prepareEvidenceUpload')
            ->with('claim-uuid-123', [
                'file_name' => 'test.webm',
                'mime_type' => 'video/webm',
                'size_bytes' => 1024
            ])
            ->willReturn([
                'upload_url' => 'https://r2.example.com/upload-signed',
                'evidence_id' => 'ev-abc-123'
            ]);
            
        static::getContainer()->set(LocationClaimCoreClient::class, $mockCoreClient);

        $client->request('POST', '/claim/evidence/prepare', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => 'dummy-csrf'
        ], json_encode([
            'file_name' => 'test.webm',
            'mime_type' => 'video/webm',
            'size_bytes' => 1024
        ]));

        $this->assertResponseIsSuccessful();
        
        $responseContent = $client->getResponse()->getContent();
        // It must NOT log or expose the token or sensitive URLs in logs, but the response JSON contains upload_url which the browser needs.
        $json = json_decode($responseContent, true);
        $this->assertArrayHasKey('success', $json);
        $this->assertArrayHasKey('upload_url', $json['data']);
        $this->assertArrayHasKey('evidence_id', $json['data']);
        $this->assertStringNotContainsString('token-456', $responseContent);
    }

    public function testCompleteUploadSuccess(): void
    {
        $client = static::createClient();
        $client->disableReboot();
        
        $session = $client->getContainer()->get('session.factory')->createSession();
        $session->set('mi_monchis.claim_flow', [
            'claim_uuid' => 'claim-uuid-123',
            'claim_access_token' => 'token-456',
            'expires_at' => time() + 3600
        ]);
        $session->start();
        $session->save();
        $client->getCookieJar()->set(new \Symfony\Component\BrowserKit\Cookie($session->getName(), $session->getId()));

        $mockCsrf = $this->createMock(CsrfTokenManagerInterface::class);
        $mockCsrf->method('isTokenValid')->willReturn(true);
        static::getContainer()->set('security.csrf.token_manager', $mockCsrf);

        $mockCoreClient = $this->createMock(LocationClaimCoreClient::class);
        // Ensure /complete uses session's claim uuid, not trusting user
        $mockCoreClient->expects($this->once())
            ->method('completeEvidenceUpload')
            ->with('claim-uuid-123', 'ev-abc-123', '"etag-xyz"')
            ->willReturn(['success' => true]);
            
        static::getContainer()->set(LocationClaimCoreClient::class, $mockCoreClient);

        $client->request('POST', '/claim/evidence/complete', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_CSRF_TOKEN' => 'dummy-csrf'
        ], json_encode([
            'evidence_id' => 'ev-abc-123',
            'etag' => '"etag-xyz"'
        ]));

        $this->assertResponseIsSuccessful();
        $this->assertEquals('{"success":true,"data":{"success":true}}', $client->getResponse()->getContent());
    }
}
