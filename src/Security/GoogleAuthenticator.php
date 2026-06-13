<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\Public\PublicUser;
use App\Service\Public\LegalAcceptanceRecorder;
use App\Service\Public\LegalDocumentClient;
use Doctrine\ORM\EntityManagerInterface;
use KnpU\OAuth2ClientBundle\Client\ClientRegistry;
use KnpU\OAuth2ClientBundle\Security\Authenticator\OAuth2Authenticator;
use League\OAuth2\Client\Provider\GoogleUser;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\RouterInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

class GoogleAuthenticator extends OAuth2Authenticator
{
    public function __construct(
        private ClientRegistry $clientRegistry,
        private EntityManagerInterface $entityManager,
        private RouterInterface $router,
        private UserPasswordHasherInterface $passwordHasher,
        private LegalDocumentClient $legalDocumentClient,
        private LegalAcceptanceRecorder $legalAcceptanceRecorder,
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
            new UserBadge($accessToken->getToken(), function () use ($accessToken, $client, $request) {
                /** @var GoogleUser $googleUser */
                $googleUser = $client->fetchUserFromToken($accessToken);

                $email = trim((string) $googleUser->getEmail());
                if ($email === '') {
                    throw new CustomUserMessageAuthenticationException('Google no devolvió un correo válido para crear la sesión.');
                }

                $existingUser = $this->entityManager->getRepository(PublicUser::class)->findOneBy(['googleId' => $googleUser->getId()]);
                if ($existingUser) {
                    return $existingUser;
                }

                $user = $this->entityManager->getRepository(PublicUser::class)->findOneBy(['email' => $email]);
                $isNewUser = !$user instanceof PublicUser;

                if (!$user) {
                    $user = new PublicUser();
                    $user->setEmail($email);
                    $user->setFirstName($googleUser->getFirstName() ?? 'Usuario');
                    $user->setLastName($googleUser->getLastName() ?? '');
                    $user->setPasswordHash($this->passwordHasher->hashPassword($user, bin2hex(random_bytes(32))));
                    $user->setRegistrationOrigin('google');
                    $user->activate();
                } elseif ($user->getStatus() === PublicUser::STATUS_PENDING_VERIFICATION) {
                    $user->activate();
                }

                $user->setGoogleId($googleUser->getId());
                $user->setGoogleAvatar($googleUser->getAvatar());

                $this->entityManager->persist($user);
                if ($isNewUser) {
                    $this->legalAcceptanceRecorder->recordMany(
                        $user,
                        $this->registrationLegalDocuments(),
                        $request,
                        'google_oauth_registration'
                    );
                }
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

    /**
     * @return array<int, array<string, mixed>>
     */
    private function registrationLegalDocuments(): array
    {
        $requiredSlugs = ['terminos-publico', 'aviso-privacidad'];
        $documents = array_values(array_filter(
            $this->legalDocumentClient->fetchPublishedDocuments(),
            static fn (array $document): bool => isset($document['slug'])
                && is_string($document['slug'])
                && in_array($document['slug'], $requiredSlugs, true)
        ));

        if (count($documents) === count($requiredSlugs)) {
            return $documents;
        }

        foreach ($requiredSlugs as $slug) {
            $document = $this->legalDocumentClient->fetchDocument($slug);
            if (is_array($document)) {
                $documents[$slug] = $document;
            }
        }

        return array_values($documents);
    }
}
