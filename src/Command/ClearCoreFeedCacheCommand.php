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
    name: 'app:core-feed:cache-clear',
    description: 'Invalidate cached Core location feed responses used by Public.'
)]
final class ClearCoreFeedCacheCommand extends Command
{
    private const COMMAND_NAME = 'app:core-feed:cache-clear';
    private const TAG = 'core_feed';

    public function __construct(private readonly TagAwareCacheInterface $cache)
    {
        parent::__construct(self::COMMAND_NAME);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $success = $this->cache->invalidateTags([self::TAG]);

        if (!$success) {
            $io->error('No se pudo invalidar la caché del feed Core.');

            return Command::FAILURE;
        }

        $io->success(sprintf('Caché del feed Core invalidada con tag "%s".', self::TAG));

        return Command::SUCCESS;
    }
}
