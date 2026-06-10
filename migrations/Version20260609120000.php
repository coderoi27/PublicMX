<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260609120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Creates public user legal acceptance records.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE public_user_legal_acceptances (id INT AUTO_INCREMENT NOT NULL, public_user_id INT NOT NULL, document_slug VARCHAR(120) NOT NULL, version_label VARCHAR(40) NOT NULL, source VARCHAR(32) NOT NULL, ip_hash VARCHAR(64) DEFAULT NULL, user_agent_hash VARCHAR(64) DEFAULT NULL, accepted_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\', INDEX IDX_PUBLIC_USER_LEGAL_ACCEPTANCE_USER (public_user_id), UNIQUE INDEX uniq_public_user_legal_version (public_user_id, document_slug, version_label), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
        $this->addSql('ALTER TABLE public_user_legal_acceptances ADD CONSTRAINT FK_PUBLIC_USER_LEGAL_ACCEPTANCE_USER FOREIGN KEY (public_user_id) REFERENCES public_users (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE public_user_legal_acceptances DROP FOREIGN KEY FK_PUBLIC_USER_LEGAL_ACCEPTANCE_USER');
        $this->addSql('DROP TABLE public_user_legal_acceptances');
    }
}
