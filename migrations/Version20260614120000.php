<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260614120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Evolves public favorites to support canonical and Google Places identities.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE public_user_favorite_places ADD source_type VARCHAR(40) NOT NULL DEFAULT \'canonical\', ADD external_source_key VARCHAR(255) DEFAULT NULL, ADD favorite_key VARCHAR(320) DEFAULT NULL, ADD snapshot_name VARCHAR(180) DEFAULT NULL, ADD snapshot_address VARCHAR(255) DEFAULT NULL, ADD snapshot_photo_url VARCHAR(1024) DEFAULT NULL, ADD snapshot_category_slug VARCHAR(120) DEFAULT NULL, ADD snapshot_category_name VARCHAR(120) DEFAULT NULL, ADD snapshot_latitude NUMERIC(10, 7) DEFAULT NULL, ADD snapshot_longitude NUMERIC(10, 7) DEFAULT NULL');
        $this->addSql('UPDATE public_user_favorite_places SET favorite_key = CONCAT(\'canonical:\', location_id) WHERE favorite_key IS NULL');
        $this->addSql('ALTER TABLE public_user_favorite_places MODIFY location_id INT DEFAULT NULL, MODIFY favorite_key VARCHAR(320) NOT NULL');
        $this->addSql('CREATE UNIQUE INDEX uniq_public_user_favorite_key ON public_user_favorite_places (public_user_id, favorite_key)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DELETE FROM public_user_favorite_places WHERE location_id IS NULL');
        $this->addSql('DROP INDEX uniq_public_user_favorite_key ON public_user_favorite_places');
        $this->addSql('ALTER TABLE public_user_favorite_places DROP source_type, DROP external_source_key, DROP favorite_key, DROP snapshot_name, DROP snapshot_address, DROP snapshot_photo_url, DROP snapshot_category_slug, DROP snapshot_category_name, DROP snapshot_latitude, DROP snapshot_longitude');
        $this->addSql('ALTER TABLE public_user_favorite_places MODIFY location_id INT NOT NULL');
    }
}
