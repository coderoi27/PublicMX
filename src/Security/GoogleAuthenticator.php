<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\Public\PublicUser;
use Doctrine\ORM\EntityManagerInterface;
use KnpU\OAuth2ClientBundle\Client\ClientRegistry;
use KnpU\OAuth2ClientBundle\Security\Authenticator\OAuth2Authenticator;
use League\OAuth2\Client\Provider\GoogleUser;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\RouterInterface;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

class GoogleAuthenticator extends OAuth2Authenticator
{
    public function __construct(
        private ClientRegistry $clientRegistry,
        private EntityManagerInterface $entityManager,
        private RouterInterface $router
    ) {
    }

    public function supports(Request $request): ?bool
    {
        return $request->attributes->get('_route') === 'connect_google_check';
    }

    public function authenticate(Request $request): Passport
    {
        $client = $this->clientRegistry->getClient('google');
        $accessToken = $this->fetchAccessToken($client);

        return new SelfValidatingPassport(
            new UserBadge($accessToken->getToken(), function () use ($accessToken, $client) {
                /** @var GoogleUser $googleUser */
                $googleUser = $client->fetchUserFromToken($accessToken);

                $email = $googleUser->getEmail();
                
                // 1. Have they logged in with Google before? O!
                $existingUser = $this->entityManager->getRepository(PublicUser::class)->findOneBy(['googleId' => $googleUser->getId()]);
                if ($existingUser) {
                    return $existingUser;
                }

                // 2. Do we have a matching user by email?
                $user = $this->entityManager->getRepository(PublicUser::class)->findOneBy(['email' => $email]);
                
                if (!$user) {
                    // Create new user if not exists
                    $user = new PublicUser();
                    $user->setEmail($email);
                    $user->setFirstName($googleUser->getFirstName() ?? 'Usuario');
                    $user->setLastName($googleUser->getLastName() ?? '');
                    // Generamos una contraseña dummy para cuentas de Google
                    $user->setPasswordHash(bin2hex(random_bytes(16)));
                    $user->setRegistrationOrigin('google');
                    // Lo activamos inmediatamente ya que Google ya verificó el correo
                    $user->activate();
                }

                // Link the Google ID
                $user->setGoogleId($googleUser->getId());
                $user->setGoogleAvatar($googleUser->getAvatar());
                
                $this->entityManager->persist($user);
                $this->entityManager->flush();

                return $user;
            })
        );
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return new RedirectResponse($this->router->generate('public_home'));
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        $message = strtr($exception->getMessageKey(), $exception->getMessageData());

        return new RedirectResponse($this->router->generate('public_login', ['error' => $message]));
    }
}
