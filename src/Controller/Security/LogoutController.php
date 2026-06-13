<?php

declare(strict_types=1);

namespace App\Controller\Security;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class LogoutController extends AbstractController
{
    #[Route('/logout', name: 'public_logout', methods: ['GET'])]
    public function __invoke(): Response
    {
        throw new \LogicException('This route is intercepted by the Symfony security firewall logout listener.');
    }
}
