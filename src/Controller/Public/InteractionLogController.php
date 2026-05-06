<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Entity\Public\PublicUser;
use App\Service\Public\EventLogClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final class InteractionLogController extends AbstractController
{
    #[Route('/api/v1/interactions/log', name: 'public_api_interactions_log', methods: ['POST'])]
    public function __invoke(Request $request, EventLogClient $eventLogClient): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload) || empty($payload['event_name']) || empty($payload['entity_type'])) {
            return $this->json(['data' => null, 'meta' => [], 'errors' => ['event_name y entity_type son obligatorios.']], 422);
        }

        $user = $this->getUser();
        $eventLogClient->submit([
            'event_name' => (string) $payload['event_name'],
            'actor_type' => $user instanceof PublicUser ? 'public_user' : 'guest',
            'actor_id' => $user instanceof PublicUser ? $user->getId() : null,
            'entity_type' => (string) $payload['entity_type'],
            'entity_id' => isset($payload['entity_id']) ? (int) $payload['entity_id'] : null,
            'source_app' => 'public',
            'metadata' => isset($payload['metadata']) && is_array($payload['metadata']) ? $payload['metadata'] : [],
            'occurred_at' => (new \DateTimeImmutable())->format(DATE_ATOM),
        ]);

        return $this->json(['data' => ['ok' => true], 'meta' => [], 'errors' => []], 202);
    }
}
