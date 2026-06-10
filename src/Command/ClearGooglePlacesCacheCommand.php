<?php

declare(strict_types=1);

namespace App\Command;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Contracts\Cache\TagAwareCacheInterface;

#[AsCommand(
    name: 'app:places:cache-clear',
    description: 'Invalidate cached Google Places proxy responses without clearing the whole Symfony cache.'
)]
final class ClearGooglePlacesCacheCommand extends Command
{
    private const TAG = 'google_places_proxy';

    public function __construct(private readonly TagAwareCacheInterface $cache)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $success = $this->cache->invalidateTags([self::TAG]);

        if (!$success) {
            $io->error('No se pudo invalidar la caché de Google Places.');

            return Command::FAILURE;
        }

        $io->success(sprintf('Caché de Google Places invalidada con tag "%s".', self::TAG));

        return Command::SUCCESS;
    }
}
