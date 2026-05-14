<?php

declare(strict_types=1);

namespace App\Controller\Public;

use App\Service\Public\LegalDocumentClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class LegalController extends AbstractController
{
    #[Route('/legal', name: 'public_legal_index', methods: ['GET'])]
    public function index(LegalDocumentClient $legalDocumentClient): Response
    {
        return $this->render('public/legal/index.html.twig', [
            'documents' => $legalDocumentClient->fetchPublishedDocuments(),
        ]);
    }

    #[Route('/legal/{slug}', name: 'public_legal_show', methods: ['GET'])]
    public function show(string $slug, LegalDocumentClient $legalDocumentClient): Response
    {
        $document = $legalDocumentClient->fetchDocument($slug);
        if ($document === null) {
            throw $this->createNotFoundException('Documento legal no encontrado.');
        }

        return $this->render('public/legal/show.html.twig', [
            'document' => $document,
            'documents' => $legalDocumentClient->fetchPublishedDocuments(),
        ]);
    }
}
