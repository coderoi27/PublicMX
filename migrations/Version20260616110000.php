<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260616110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Adds Mi Monchis own reviews and media for canonical locations and Google Places.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE public_user_reviews (id INT AUTO_INCREMENT NOT NULL, public_user_id INT NOT NULL, source_type VARCHAR(40) NOT NULL, location_id INT DEFAULT NULL, external_source_key VARCHAR(255) DEFAULT NULL, review_key VARCHAR(320) NOT NULL, rating_value SMALLINT NOT NULL, review_body LONGTEXT DEFAULT NULL, status VARCHAR(32) NOT NULL, moderation_note VARCHAR(255) DEFAULT NULL, moderated_at DATETIME DEFAULT NULL COMMENT \'(DC2Type:datetime_immutable)\', created_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\', updated_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\', INDEX IDX_77330E579061DB7B (public_user_id), INDEX idx_public_reviews_subject_status (review_key, status), UNIQUE INDEX uniq_public_user_review_subject (public_user_id, review_key), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
        $this->addSql('CREATE TABLE public_user_review_media (id INT AUTO_INCREMENT NOT NULL, review_id INT NOT NULL, media_type VARCHAR(32) NOT NULL, storage_url VARCHAR(1024) NOT NULL, thumbnail_url VARCHAR(1024) DEFAULT NULL, original_filename VARCHAR(255) DEFAULT NULL, status VARCHAR(32) NOT NULL, created_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\', updated_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\', INDEX IDX_E9DC2E5B3E2E969B (review_id), INDEX idx_public_review_media_status (status), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
        $this->addSql('ALTER TABLE public_user_reviews ADD CONSTRAINT FK_77330E579061DB7B FOREIGN KEY (public_user_id) REFERENCES public_users (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE public_user_review_media ADD CONSTRAINT FK_E9DC2E5B3E2E969B FOREIGN KEY (review_id) REFERENCES public_user_reviews (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE public_user_review_media DROP FOREIGN KEY FK_E9DC2E5B3E2E969B');
        $this->addSql('ALTER TABLE public_user_reviews DROP FOREIGN KEY FK_77330E579061DB7B');
        $this->addSql('DROP TABLE public_user_review_media');
        $this->addSql('DROP TABLE public_user_reviews');
    }
}
