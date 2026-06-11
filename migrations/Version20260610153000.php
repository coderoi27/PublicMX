<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260610153000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Adds Google OAuth fields to public users.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE public_users ADD google_id VARCHAR(255) DEFAULT NULL, ADD google_avatar VARCHAR(1024) DEFAULT NULL');
        $this->addSql('CREATE UNIQUE INDEX uniq_public_users_google_id ON public_users (google_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX uniq_public_users_google_id ON public_users');
        $this->addSql('ALTER TABLE public_users DROP google_id, DROP google_avatar');
    }
}
