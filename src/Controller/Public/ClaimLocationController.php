<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Service\Public\BlockedEmailDomainClient;
use App\Service\Public\LocationClaimClient;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\Routing\Attribute\Route;

final class ClaimLocationController extends AbstractController
{
    #[Route('/claim-local', name: 'public_claim_location', methods: ['GET', 'POST'])]
    public function __invoke(
        Request $request,
        LocationClaimClient $locationClaimClient,
        BlockedEmailDomainClient $blockedEmailDomainClient,
        #[Autowire(service: 'limiter.public_claim_location')] RateLimiterFactory $claimLimiter,
    ): Response {
        $defaults = [
            'source_type' => (string) $request->query->get('source_type', 'google_places'),
            'canonical_location_id' => $request->query->get('location_id'),
            'external_source_key' => $request->query->get('place_id'),
            'location_name' => (string) $request->query->get('location_name', ''),
            'short_address' => (string) $request->query->get('short_address', ''),
            'lat' => $request->query->get('lat'),
            'lng' => $request->query->get('lng'),
            'category_slug' => (string) $request->query->get('category_slug', ''),
        ];

        $user = $this->getUser();
        if ($user instanceof PublicUser) {
            $defaults['claimant_name'] = trim($user->getFirstName() . ' ' . $user->getLastName());
            $defaults['email'] = $user->getEmail();
        }

        if ($request->isMethod('GET')) {
            return $this->render('public/claim_location.html.twig', ['form' => $defaults, 'errors' => []]);
        }

        $form = [
            'source_type' => (string) $request->request->get('source_type', $defaults['source_type']),
            'canonical_location_id' => $request->request->get('canonical_location_id'),
            'external_source_key' => (string) $request->request->get('external_source_key', ''),
            'location_name' => trim((string) $request->request->get('location_name', '')),
            'short_address' => trim((string) $request->request->get('short_address', '')),
            'lat' => $request->request->get('lat'),
            'lng' => $request->request->get('lng'),
            'category_slug' => trim((string) $request->request->get('category_slug', '')),
            'claimant_name' => trim((string) $request->request->get('claimant_name', '')),
            'email' => mb_strtolower(trim((string) $request->request->get('email', ''))),
            'whatsapp_e164' => trim((string) $request->request->get('whatsapp_e164', '')),
            'message' => trim((string) $request->request->get('message', '')),
        ];

        $limit = $claimLimiter->create(($request->getClientIp() ?? 'unknown') . '|' . $form['email'])->consume(1);
        if (!$limit->isAccepted()) {
            return $this->render('public/claim_location.html.twig', [
                'form' => $form,
                'errors' => ['Alcanzaste el límite temporal de solicitudes de claim. Intenta más tarde.'],
            ], new Response('', 429));
        }

        $errors = [];
        foreach (['source_type', 'location_name', 'claimant_name', 'email'] as $field) {
            if ($form[$field] === '') {
                $errors[] = 'Completa todos los campos obligatorios del claim.';
                break;
            }
        }

        if (!filter_var($form['email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Captura un correo válido.';
        }

        if ($blockedEmailDomainClient->isBlocked($form['email'])) {
            $errors[] = 'No aceptamos correos temporales o desechables para solicitar claims.';
        }

        if ($errors !== []) {
            return $this->render('public/claim_location.html.twig', ['form' => $form, 'errors' => $errors], new Response('', 422));
        }

        $result = $locationClaimClient->submit([
            'source_type' => $form['source_type'],
            'canonical_location_id' => is_numeric((string) $form['canonical_location_id']) ? (int) $form['canonical_location_id'] : null,
            'external_source_key' => $form['external_source_key'] !== '' ? $form['external_source_key'] : null,
            'location_name' => $form['location_name'],
            'short_address' => $form['short_address'] !== '' ? $form['short_address'] : null,
            'claimant_name' => $form['claimant_name'],
            'email' => $form['email'],
            'whatsapp_e164' => $form['whatsapp_e164'] !== '' ? $form['whatsapp_e164'] : null,
            'message' => $form['message'] !== '' ? $form['message'] : null,
            'prefill_payload' => [
                'location_name' => $form['location_name'],
                'short_address' => $form['short_address'],
                'source_type' => $form['source_type'],
                'lat' => is_numeric((string) $form['lat']) ? (float) $form['lat'] : null,
                'lng' => is_numeric((string) $form['lng']) ? (float) $form['lng'] : null,
                'category_slug' => $form['category_slug'] !== '' ? $form['category_slug'] : null,
            ],
        ]);

        if (!$result['ok']) {
            return $this->render('public/claim_location.html.twig', [
                'form' => $form,
                'errors' => [$result['errors'][0] ?? 'No se pudo registrar tu claim.'],
            ], new Response('', 502));
        }

        $this->addFlash('success', 'Recibimos tu solicitud de claim. La revisaremos para validar la propiedad del local.');

        return $this->redirectToRoute('public_home');
    }
}
