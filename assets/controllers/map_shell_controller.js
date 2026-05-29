import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = [
        'canvas',
        'status',
        'statusDuplicate',
        'count',
        'countDuplicate',
        'list',
        'mapStage',
        'exploreList',
        'exploreListGrid',
        'modeToggleButton',
        'heroLocationDesktop',
        'exploreSection',
        'favoritesSection',
        'addressesSection',
        'profileSection',
        'exploreTabButton',
        'favoritesTabButton',
        'addressesTabButton',
        'profileTabButton',
        'detailSheet',
        'detailSheetBody',
        'heroLocation',
        'sourceFilterRow',
        'chipRow',
        'categoryChip',
        'notificationsButton',
        'notificationsPanel',
        'locationSwitcherButton',
        'locationSwitcher',
        'notificationsBadge',
        'favoritesCount',
        'favoritesCountDuplicate',
        'favoritesList',
        'addressesCount',
        'addressesCountDuplicate',
        'addressesList',
        'addressLabelInput',
        'addressCityInput',
        'addressStateInput',
        'addressReferenceInput',
        'addressLatInput',
        'addressLngInput',
        'addressPrimaryInput',
        'addressStatus',
        'canvasNote',
        'walkthrough',
        'walkthroughCursor',
        'walkthroughCopy',
        'walkthroughForm',
        'walkthroughAddressInput',
        'walkthroughSuggestions',
        'walkthroughGeoButton',
        'walkthroughLogo',
        'walkthroughError',
        'cookieConsentStatus',
    ];
    static values = {
        feedUrl: String,
        favoritesUrl: String,
        addressesUrl: String,
        googleMapsApiKey: String,
        claimUrl: String,
        eventLogUrl: String,
        walkthroughEnabled: Boolean,
        logoUrl: String,
        authenticated: Boolean,
        initialFavorites: Array,
        initialAddresses: Array,
        lat: Number,
        lng: Number,
    };

    connect() {
        this.latValue = this.hasLatValue ? Number(this.latValue) : Number.NaN;
        this.lngValue = this.hasLngValue ? Number(this.lngValue) : Number.NaN;
        this.favoriteLocationIds = Array.isArray(this.initialFavoritesValue) ? [...this.initialFavoritesValue] : [];
        this.savedAddresses = Array.isArray(this.initialAddressesValue) ? [...this.initialAddressesValue] : [];
        this.currentLocations = [];
        this.visibleLocations = [];
        this.currentFeedSource = 'canonical';
        this.fallbackCategoryDefinitions = {
            tacos: { label: 'Tacos', colorHex: '#F97316', iconKey: 'taco' },
            veggie: { label: 'Veggie', colorHex: '#16A34A', iconKey: 'leaf' },
            cafe: { label: 'Café', colorHex: '#8B5E3C', iconKey: 'coffee' },
            comida: { label: 'Comida', colorHex: '#2563EB', iconKey: 'plate' },
        };
        this.categoryCatalog = [];
        this.categoryCatalogBySlug = new Map();
        this.selectedLocationId = null;
        this.activeCategoryFilter = 'all';
        this.joyitasOnly = false;
        this.activeSourceFilter = 'all';
        this.map = null;
        this.markers = [];
        this.infoWindow = null;
        this.googleMapsReady = false;
        this.currentMapTypeId = 'roadmap';
        this.walkthroughTypingTimer = null;
        this.walkthroughHideTimer = null;
        this.mapIdleTimer = null;
        this.walkthroughPredictions = [];
        this.walkthroughSelection = null;
        this.userMarker = null;
        this.notificationsOpen = false;
        this.locationSwitcherOpen = false;
        this.exploreMode = 'map';
        this.activeSection = 'explore';
        this.placeDetailsCache = new Map();
        this.lastDiscoveryCenter = null;
        this.isDiscoveringPlaces = false;
        this.isSyncingMapViewport = false;
        this.currentLocationLabel = this.hasHeroLocationTarget ? this.heroLocationTarget.textContent.trim() : '';
        this.restoreExploreMode();
        this.restorePersistedLocationContext();
        this.renderFavoritesSummary();
        this.renderAddressesSummary();
        this.renderCookieConsentStatus();
        this.renderExploreMode();
        this.renderActiveSection();
        const walkthroughIsActive = this.initializeWalkthrough();
        if (!walkthroughIsActive || this.hasUserCoordinates()) {
            this.loadFeed();
        }
    }

    disconnect() {
        if (this.walkthroughTypingTimer) {
            window.clearTimeout(this.walkthroughTypingTimer);
        }
        if (this.walkthroughHideTimer) {
            window.clearTimeout(this.walkthroughHideTimer);
        }
        if (this.mapIdleTimer) {
            window.clearTimeout(this.mapIdleTimer);
        }
    }

    async detectLocation() {
        try {
            this.setStatus('Solicitando geolocalización...');
            const coords = await this.requestGeolocation();
            this.applyCoordinates(coords.latitude, coords.longitude);
            this.updateHeroLocation('Ubicación actual');
            this.setStatus('Ubicación detectada. Refrescando feed...');
            await this.loadFeed();
        } catch (error) {
            this.setStatus(`No se pudo obtener tu ubicación: ${error.message}`);
        }
    }

    async detectLocationFromWalkthrough() {
        this.setWalkthroughError('');

        try {
            const coords = await this.requestGeolocation();
            this.applyCoordinates(coords.latitude, coords.longitude);
            this.updateHeroLocation('Ubicación actual');
            await this.completeWalkthrough();
            await this.loadFeed();
            this.refreshMapViewport();
            this.setStatus('Ubicación detectada desde el walkthrough.');
        } catch (error) {
            this.setWalkthroughError(`No se pudo obtener tu ubicación: ${error.message}`);
        }
    }

    async submitWalkthroughAddress(event) {
        event.preventDefault();

        const address = this.hasWalkthroughAddressInputTarget ? this.walkthroughAddressInputTarget.value.trim() : '';
        if (address === '') {
            this.setWalkthroughError('Escribe una direccion antes de continuar.');
            return;
        }

        this.setWalkthroughError('');

        try {
            const selection = await this.resolveWalkthroughSelection(address);
            this.applyCoordinates(selection.lat, selection.lng);
            this.updateHeroLocation(selection.label);
            this.walkthroughSelection = selection;
            this.hideWalkthroughSuggestions();
            await this.completeWalkthrough();
            await this.loadFeed();
            this.refreshMapViewport();
            this.setStatus(`Explorando cerca de ${selection.label}.`);
        } catch (error) {
            this.setWalkthroughError(error.message);
        }
    }

    async searchWalkthroughAddress() {
        if (!this.hasWalkthroughAddressInputTarget) {
            return;
        }

        if (this.walkthroughHideTimer) {
            window.clearTimeout(this.walkthroughHideTimer);
        }

        const query = this.walkthroughAddressInputTarget.value.trim();
        if (query.length < 3) {
            this.walkthroughSelection = null;
            this.walkthroughPredictions = [];
            this.hideWalkthroughSuggestions();
            return;
        }

        if (this.walkthroughSelection && this.walkthroughSelection.label !== query) {
            this.walkthroughSelection = null;
        }

        try {
            this.walkthroughPredictions = await this.fetchPlacePredictions(query);
            this.setWalkthroughError('');
            this.renderWalkthroughSuggestions();
        } catch (error) {
            this.walkthroughPredictions = [];
            this.hideWalkthroughSuggestions();
            if (!error.message.includes('Places')) {
                this.setWalkthroughError(error.message);
            }
        }
    }

    async selectWalkthroughSuggestion(event) {
        const placeId = event.currentTarget.dataset.placeId ?? '';
        if (placeId === '') {
            return;
        }

        const prediction = this.walkthroughPredictions.find((item) => item.placeId === placeId);
        if (!prediction) {
            return;
        }

        try {
            const details = await this.fetchPlaceDetails(placeId);
            this.walkthroughSelection = {
                lat: details.lat,
                lng: details.lng,
                label: prediction.primaryText || prediction.description,
                description: prediction.description,
                placeId,
            };
            this.walkthroughAddressInputTarget.value = prediction.description;
            this.setWalkthroughError('');
            this.renderWalkthroughSuggestions();
        } catch (error) {
            this.setWalkthroughError(error.message);
        }
    }

    queueHideWalkthroughSuggestions() {
        if (this.walkthroughHideTimer) {
            window.clearTimeout(this.walkthroughHideTimer);
        }

        this.walkthroughHideTimer = window.setTimeout(() => {
            this.hideWalkthroughSuggestions();
        }, 180);
    }

    toggleNotifications() {
        this.notificationsOpen = !this.notificationsOpen;
        this.renderNotificationsState();
    }

    closeNotificationsOnOutsideClick(event) {
        if (!this.notificationsOpen || !this.hasNotificationsPanelTarget || !this.hasNotificationsButtonTarget) {
            return;
        }

        const clickedInsidePanel = this.notificationsPanelTarget.contains(event.target);
        const clickedButton = this.notificationsButtonTarget.contains(event.target);
        if (!clickedInsidePanel && !clickedButton) {
            this.notificationsOpen = false;
            this.renderNotificationsState();
        }
    }

    toggleLocationSwitcher() {
        this.locationSwitcherOpen = !this.locationSwitcherOpen;
        this.renderLocationSwitcherState();
    }

    showExploreSection() {
        this.activeSection = 'explore';
        this.renderActiveSection();
        this.logInteraction('public_section_changed', 'ui_section', null, { section: 'explore' });
    }

    showFavoritesSection() {
        this.activeSection = 'favorites';
        this.renderActiveSection();
        this.logInteraction('public_section_changed', 'ui_section', null, { section: 'favorites' });
    }

    showAddressesSection() {
        this.activeSection = 'addresses';
        this.renderActiveSection();
        this.logInteraction('public_section_changed', 'ui_section', null, { section: 'addresses' });
    }

    showProfileSection() {
        this.activeSection = 'profile';
        this.renderActiveSection();
        this.logInteraction('public_section_changed', 'ui_section', null, { section: 'profile' });
    }

    setMapMode() {
        this.exploreMode = 'map';
        this.persistExploreMode();
        this.renderExploreMode();
        this.refreshMapViewport();
    }

    setListMode() {
        this.exploreMode = 'list';
        this.persistExploreMode();
        this.renderExploreMode();
    }

    toggleMapListMode() {
        if (this.exploreMode === 'map') {
            this.setListMode();
        } else {
            this.setMapMode();
        }
    }

    closeLocationSwitcherOnOutsideClick(event) {
        if (!this.locationSwitcherOpen || !this.hasLocationSwitcherTarget || !this.hasLocationSwitcherButtonTarget) {
            return;
        }

        const clickedInsidePanel = this.locationSwitcherTarget.contains(event.target);
        const clickedButton = this.locationSwitcherButtonTarget.contains(event.target);
        if (!clickedInsidePanel && !clickedButton) {
            this.locationSwitcherOpen = false;
            this.renderLocationSwitcherState();
        }
    }

    async selectSavedAddress(event) {
        const { lat, lng, label } = event.currentTarget.dataset;
        this.applyCoordinates(Number(lat), Number(lng));
        this.updateHeroLocation(label);
        await this.loadFeed();
        this.activeSection = 'explore';
        this.renderActiveSection();
        this.locationSwitcherOpen = false;
        this.renderLocationSwitcherState();
        this.logInteraction('public_saved_address_selected', 'user_address', Number(event.currentTarget.dataset.addressId ?? 0) || null, {
            label,
        });
    }

    async focusLocation(event) {
        const interactiveElement = event.target.closest('button, a, input, label, form');
        if (interactiveElement) {
            return;
        }

        const locationKey = event.currentTarget.dataset.locationKey ?? '';
        if (locationKey === '') {
            return;
        }

        const location = this.currentLocations.find((item) => this.locationKey(item) === locationKey);
        if (!location) {
            return;
        }

        this.setSelectedLocation(locationKey);
        const enrichedLocation = await this.enrichLocationIfNeeded(location);
        this.renderDetailSheet(enrichedLocation);
        this.logInteraction('public_location_opened', 'location', Number(enrichedLocation.location_id) || null, {
            source_type: enrichedLocation.source_type ?? null,
            place_id: enrichedLocation.place_id ?? null,
            location_key: locationKey,
            mode: this.exploreMode,
        });

        if (this.googleMapsReady && this.map) {
            this.focusMapLocation(enrichedLocation);
            return;
        }

        this.setStatus(`Local seleccionado: ${enrichedLocation.location_name ?? locationKey}.`);
    }

    async toggleFavorite(event) {
        if (!this.authenticatedValue) {
            this.setStatus('Inicia sesión para guardar favoritos.');
            return;
        }

        const button = event.currentTarget;
        const locationId = Number.parseInt(button.dataset.locationId ?? '', 10);
        if (Number.isNaN(locationId)) {
            this.setStatus('No se pudo identificar el local.');
            return;
        }

        button.disabled = true;

        try {
            if (this.favoriteLocationIds.includes(locationId)) {
                await this.requestJson(`${this.favoritesUrlValue}/${locationId}`, { method: 'DELETE' });
                this.favoriteLocationIds = this.favoriteLocationIds.filter((id) => id !== locationId);
                this.setStatus(`Local #${locationId} eliminado de favoritos.`);
                this.logInteraction('public_favorite_removed', 'location', locationId, {});
            } else {
                await this.requestJson(this.favoritesUrlValue, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location_id: locationId }),
                });
                this.favoriteLocationIds = [...this.favoriteLocationIds, locationId];
                this.setStatus(`Local #${locationId} guardado en favoritos.`);
                this.logInteraction('public_favorite_added', 'location', locationId, {});
            }

            this.renderFavoritesSummary();
            this.syncFavoriteButtons();
            this.refreshDetailSheet();
        } catch (error) {
            this.setStatus(error.message);
        } finally {
            button.disabled = false;
        }
    }

    async removeFavoriteFromList(event) {
        if (!this.authenticatedValue) {
            return;
        }

        const locationId = Number.parseInt(event.currentTarget.dataset.locationId ?? '', 10);
        if (Number.isNaN(locationId)) {
            return;
        }

        try {
            await this.requestJson(`${this.favoritesUrlValue}/${locationId}`, { method: 'DELETE' });
            this.favoriteLocationIds = this.favoriteLocationIds.filter((id) => id !== locationId);
            this.renderFavoritesSummary();
            this.syncFavoriteButtons();
            this.setStatus(`Local #${locationId} eliminado de favoritos.`);
            this.refreshDetailSheet();
            this.logInteraction('public_favorite_removed', 'location', locationId, {});
        } catch (error) {
            this.setStatus(error.message);
        }
    }

    async saveAddress(event) {
        event.preventDefault();

        if (!this.authenticatedValue) {
            this.setAddressStatus('Inicia sesión para guardar direcciones.');
            return;
        }

        const payload = {
            label: this.addressLabelInputTarget.value.trim(),
            city: this.addressCityInputTarget.value.trim() || null,
            state: this.addressStateInputTarget.value.trim() || null,
            reference: this.addressReferenceInputTarget.value.trim() || null,
            latitude: this.normalizeOptionalCoordinate(this.addressLatInputTarget.value),
            longitude: this.normalizeOptionalCoordinate(this.addressLngInputTarget.value),
            is_primary: this.addressPrimaryInputTarget.checked,
        };

        if (!payload.label) {
            this.setAddressStatus('Captura una etiqueta para la dirección.');
            return;
        }

        try {
            await this.requestJson(this.addressesUrlValue, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            await this.refreshAddresses();
            this.resetAddressForm();
            this.setAddressStatus(`Dirección "${payload.label}" guardada correctamente.`);
            this.setStatus('Dirección guardada en tu cuenta.');
            this.logInteraction('public_address_saved', 'user_address', null, payload);
        } catch (error) {
            this.setAddressStatus(error.message);
        }
    }

    async removeAddressFromList(event) {
        if (!this.authenticatedValue) {
            return;
        }

        const addressId = Number.parseInt(event.currentTarget.dataset.addressId ?? '', 10);
        if (Number.isNaN(addressId)) {
            return;
        }

        try {
            await this.requestJson(`${this.addressesUrlValue}/${addressId}`, { method: 'DELETE' });
            await this.refreshAddresses();
            this.setAddressStatus('Ubicación eliminada.');
            this.logInteraction('public_address_removed', 'user_address', addressId, {});
        } catch (error) {
            this.setAddressStatus(error.message);
        }
    }

    prefillCurrentCoordinates() {
        if (!this.hasUserCoordinates()) {
            this.setAddressStatus('Primero detecta o selecciona una ubicación.');
            return;
        }

        this.addressLatInputTarget.value = Number(this.latValue).toFixed(6);
        this.addressLngInputTarget.value = Number(this.lngValue).toFixed(6);
        if (!this.addressReferenceInputTarget.value.trim()) {
            this.addressReferenceInputTarget.value = this.currentLocationLabel || 'Ubicación actual';
        }
        this.setAddressStatus('Coordenadas cargadas desde tu ubicación actual.');
    }

    async loadFeed() {
        this.setStatus('Cargando feed canónico...');

        const url = new URL(this.feedUrlValue, window.location.origin);
        if (this.hasUserCoordinates()) {
            url.searchParams.set('lat', String(this.latValue));
            url.searchParams.set('lng', String(this.lngValue));
        }

        try {
            const response = await fetch(url.toString(), {
                headers: {
                    Accept: 'application/json',
                },
            });

            const payload = await response.json();
            this.registerCategoryCatalog(payload.meta?.category_catalog ?? []);
            this.googlePlacesProxyEnabled = payload.meta?.plugins?.google_places_proxy === true;
            const canonicalLocations = Array.isArray(payload.data) ? payload.data : [];
            let locations = canonicalLocations;
            this.currentFeedSource = 'canonical';

            if (this.shouldFetchGooglePlaces()) {
                const googleLocations = await this.fetchNearbyPlacesFallback();
                if (googleLocations.length > 0) {
                    locations = this.mergeLocationsWithGooglePlaces(canonicalLocations, googleLocations);
                    this.currentFeedSource = canonicalLocations.length > 0 ? 'hybrid' : 'places_fallback';
                }
            }

            this.currentLocations = locations;
            
            const userPosition = this.currentUserPosition();
            if (Number.isFinite(userPosition.lat) && Number.isFinite(userPosition.lng)) {
                this.currentLocations.forEach(loc => {
                    const lat = loc.latitude ?? loc.lat;
                    const lng = loc.longitude ?? loc.lng;
                    if (lat !== undefined && lng !== undefined) {
                        loc.distance_meters = this.distanceMeters(userPosition.lat, userPosition.lng, lat, lng);
                    }
                });
                this.currentLocations.sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity));
            }

            this.renderCategoryChips(this.currentLocations);
            const filteredLocations = this.filteredLocations(this.currentLocations);
            this.visibleLocations = filteredLocations;
            const selectedLocation = filteredLocations.find((location) => this.locationKey(location) === this.selectedLocationId) ?? filteredLocations[0] ?? null;
            this.selectedLocationId = selectedLocation ? this.locationKey(selectedLocation) : null;

            this.updateCounts(filteredLocations.length);
            this.renderList(filteredLocations);
            await this.renderCanvas(filteredLocations);
            this.syncFavoriteButtons();
            this.syncActiveCard();
            this.refreshDetailSheet();

            if (payload.errors && payload.errors.length > 0) {
                this.setStatus(payload.errors[0]);
                return;
            }

            if (this.currentFeedSource === 'places_fallback') {
                this.setStatus(locations.length > 0
                    ? 'Explora locales cercanos.'
                    : 'No encontré lugares cercanos.');
                return;
            }

            this.setStatus(locations.length > 0 ? 'Explora locales cercanos.' : 'Aún no hay locales visibles.');
        } catch (error) {
            this.setStatus(`No se pudo cargar el feed: ${error.message}`);
            if (this.hasListTarget) {
                this.listTarget.innerHTML = '<div class="map-shell__empty">No se pudo cargar el feed.</div>';
            }
            this.canvasTarget.innerHTML = '';
        }
    }

    async applyCategoryFilter(event) {
        const nextFilter = event.currentTarget.dataset.categoryFilter ?? 'all';
        if (nextFilter === '__joyitas') {
            this.joyitasOnly = !this.joyitasOnly;
        } else if (nextFilter.startsWith('__source:')) {
            this.activeSourceFilter = nextFilter.replace('__source:', '') || 'all';
        } else {
            this.activeCategoryFilter = nextFilter;
        }
        this.renderCategoryChips(this.currentLocations);

        this.visibleLocations = this.filteredLocations(this.currentLocations);
        const selectedStillVisible = this.visibleLocations.find((location) => this.locationKey(location) === this.selectedLocationId);
        if (!selectedStillVisible) {
            this.selectedLocationId = this.visibleLocations[0] ? this.locationKey(this.visibleLocations[0]) : null;
        }

        this.updateCounts(this.visibleLocations.length);
        this.renderList(this.visibleLocations);
        await this.renderCanvas(this.visibleLocations);
        this.syncFavoriteButtons();
        this.syncActiveCard();
        if (this.visibleLocations.length === 0) {
            this.setStatus('No encontré locales para esa categoría.');
        }
    }

    renderList(locations) {
        const markup = locations.length === 0
            ? ''
            : locations.map((location, index) => `
            <article
                class="mobile-map-card ${this.locationKey(location) === this.selectedLocationId ? 'is-active' : ''}"
                data-index="${index}"
                data-action="click->map-shell#focusLocation"
                data-location-key="${this.escapeHtml(this.locationKey(location))}"
                data-card-location-key="${this.escapeHtml(this.locationKey(location))}"
            >
                <div class="mobile-map-card__media mobile-map-card__media--${this.mediaTone(location)} ${location.photo_url ? 'has-photo' : ''}" ${this.mediaStyle(location)}>
                    ${this.canFavorite(location) ? this.favoriteButtonMarkup(Number(location.location_id)) : ''}
                    <span class="mobile-map-card__source-badge ${this.sourceBadgeClass(location)}">${this.escapeHtml(this.sourceTypeLabel(location.source_type))}</span>
                    <div class="mobile-map-card__media-copy">
                        <span>${this.escapeHtml((location.merchant_name ?? 'M').slice(0, 1).toUpperCase())}</span>
                    </div>
                </div>
                <div class="mobile-map-card__body">
                    <div class="mobile-map-card__floating-badges">
                        <div class="mobile-map-card__badge mobile-map-card__badge--distance">
                            ${this.formatDistance(location.distance_meters)}
                        </div>
                        ${(location.rating || location.meta?.rating) ? `
                        <div class="mobile-map-card__badge mobile-map-card__badge--rating">
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            ${location.rating ?? location.meta.rating}${location.user_rating_count ? ` (${location.user_rating_count})` : ''}
                        </div>
                        ` : ''}
                    </div>
                    <h3>${this.escapeHtml(location.location_name ?? 'Sin nombre')}</h3>
                    <p class="mobile-map-card__address">
                        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-6-5.3-6-11a6 6 0 1 1 12 0c0 5.7-6 11-6 11Zm0-8.2a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z"/></svg>
                        <span class="mobile-map-card__address-text">${this.escapeHtml(this.cardSubtitle(location))}</span>
                    </p>
                    ${this.categoryTagMarkup(location)}
                    <div class="mobile-map-card__meta">
                        <span class="mobile-map-card__status ${this.publicationStatusClass(location)}">${this.escapeHtml(this.publicationStatusLabel(location))}</span>
                    </div>
                </div>
            </article>
        `).join('');

        if (this.hasListTarget) {
            this.listTarget.innerHTML = locations.length === 0
                ? '<div class="map-shell__empty">Todavía no hay puntos visibles.</div>'
                : markup;
        }

        if (this.hasExploreListGridTarget) {
            this.exploreListGridTarget.innerHTML = locations.length === 0
                ? '<article class="mobile-map-app__empty-state mobile-map-app__empty-state--list"><strong>No encontré locales en esta zona</strong><p>Ajusta la ubicación, mueve el mapa o cambia de categoría.</p></article>'
                : markup;
        }
    }

    async renderCanvas(locations, options = {}) {
        if (this.googleMapsApiKeyValue && this.googleMapsApiKeyValue.trim() !== '') {
            try {
                await this.renderGoogleMap(locations, options);
                return;
            } catch (error) {
                this.setCanvasNote(`Google Maps no se pudo inicializar: ${error.message}`);
            }
        } else {
            this.setCanvasNote('GOOGLE_MAPS_API_KEY no está configurado. Se muestra la vista fallback.');
        }

        this.googleMapsReady = false;
        this.renderFallbackCanvas(locations);
    }

    filteredLocations(locations) {
        return locations.filter((location) => {
            const matchesCategory = this.activeCategoryFilter === 'all' || this.locationCategoryKey(location) === this.activeCategoryFilter;
            const matchesJoyita = !this.joyitasOnly || this.locationIsJoyita(location);
            const matchesSource = this.activeSourceFilter === 'all' || this.locationSourceGroup(location) === this.activeSourceFilter;

            return matchesCategory && matchesJoyita && matchesSource;
        });
    }

    renderCategoryChips(locations) {
        if (!this.hasChipRowTarget || !this.hasSourceFilterRowTarget) {
            return;
        }

        const categoryKeys = this.availableCategoryKeys(locations);
        if (!categoryKeys.includes(this.activeCategoryFilter) && this.activeCategoryFilter !== 'all') {
            this.activeCategoryFilter = 'all';
        }

        if (!this.availableSourceKeys(locations).includes(this.activeSourceFilter)) {
            this.activeSourceFilter = 'all';
        }

        this.sourceFilterRowTarget.innerHTML = this.sourceFilterSegmentedMarkup(locations);

        this.chipRowTarget.innerHTML = categoryKeys.map((categoryKey) => {
            const label = categoryKey === 'all' ? 'Todos' : this.categoryDisplayName(categoryKey);
            const chipStyle = categoryKey === 'all'
                ? ''
                : `style="--chip-accent:${this.escapeHtml(this.categoryColor(categoryKey))};"`;

            return `
                <button
                    type="button"
                    class="mobile-map-app__chip ${categoryKey === this.activeCategoryFilter ? 'is-active' : ''}"
                    ${chipStyle}
                    data-map-shell-target="categoryChip"
                    data-category-filter="${this.escapeHtml(categoryKey)}"
                    data-action="map-shell#applyCategoryFilter"
                >
                    ${this.escapeHtml(label)}
                </button>
            `;
        }).join('') + this.joyitasChipMarkup(locations);
    }

    sourceFilterSegmentedMarkup(locations) {
        const availableSources = this.availableSourceKeys(locations);
        if (availableSources.length <= 1) {
            return '';
        }

        const sources = [
            ['all', 'Todas las fuentes'],
            ['mimonchis', 'Mi Monchis'],
            ['google', 'Google'],
        ];

        return sources
            .map(([sourceKey, label]) => `
                <button
                    type="button"
                    class="mobile-map-app__segmented-btn ${this.activeSourceFilter === sourceKey ? 'is-active' : ''}"
                    data-category-filter="__source:${this.escapeHtml(sourceKey)}"
                    data-action="map-shell#applyCategoryFilter"
                >
                    ${this.escapeHtml(label)}
                </button>
            `)
            .join('');
    }

    availableSourceKeys(locations) {
        return ['all', 'mimonchis', 'google'];
    }

    joyitasChipMarkup(locations) {
        if (!locations.some((location) => this.locationIsJoyita(location))) {
            return '';
        }

        return `
            <button
                type="button"
                class="mobile-map-app__chip mobile-map-app__chip--joyita ${this.joyitasOnly ? 'is-active' : ''}"
                data-category-filter="__joyitas"
                data-action="map-shell#applyCategoryFilter"
            >
                Joyitas
            </button>
        `;
    }

    availableCategoryKeys(locations) {
        const discoveredCategories = new Set();

        locations.forEach((location) => {
            const category = this.locationCategoryKey(location);
            if (category !== 'all') {
                discoveredCategories.add(category);
            }
        });

        const orderedDiscovered = this.categoryCatalog
            .map((category) => String(category.slug))
            .filter((slug) => discoveredCategories.has(slug));
        const remainingFallback = [...discoveredCategories].filter((slug) => !orderedDiscovered.includes(slug));

        return ['all', ...orderedDiscovered, ...remainingFallback];
    }

    shouldFetchGooglePlaces() {
        return this.hasUserCoordinates() && this.googlePlacesProxyEnabled;
    }

    mergeLocationsWithGooglePlaces(canonicalLocations, googleLocations) {
        if (!Array.isArray(canonicalLocations) || canonicalLocations.length === 0) {
            return googleLocations;
        }

        const merged = [...canonicalLocations];

        googleLocations.forEach((googleLocation) => {
            const duplicate = canonicalLocations.some((canonicalLocation) => this.isSamePhysicalLocation(canonicalLocation, googleLocation));
            if (!duplicate) {
                merged.push(googleLocation);
            }
        });

        return merged;
    }

    isSamePhysicalLocation(left, right) {
        const leftExternalKey = left.external_source_key ?? left.place_id ?? null;
        const rightExternalKey = right.external_source_key ?? right.place_id ?? null;
        if (leftExternalKey && rightExternalKey && String(leftExternalKey) === String(rightExternalKey)) {
            return true;
        }

        const leftLat = Number(left.lat);
        const leftLng = Number(left.lng);
        const rightLat = Number(right.lat);
        const rightLng = Number(right.lng);

        if (Number.isFinite(leftLat) && Number.isFinite(leftLng) && Number.isFinite(rightLat) && Number.isFinite(rightLng)) {
            return this.distanceMeters(leftLat, leftLng, rightLat, rightLng) <= 60;
        }

        const leftName = this.normalizeComparisonText(left.location_name ?? left.merchant_name ?? '');
        const rightName = this.normalizeComparisonText(right.location_name ?? right.merchant_name ?? '');
        const leftAddress = this.normalizeComparisonText(left.short_address ?? '');
        const rightAddress = this.normalizeComparisonText(right.short_address ?? '');

        return leftName !== '' && leftName === rightName && leftAddress !== '' && leftAddress === rightAddress;
    }

    renderFallbackCanvas(locations) {
        if (locations.length === 0) {
            this.canvasTarget.innerHTML = '<div class="map-shell__canvas-empty">Sin puntos que dibujar</div>';
            return;
        }

        const points = locations.map((location, index) => {
            const x = ((index * 19) % 70) + 12;
            const y = ((index * 13) % 58) + 18;

            return `
                <button
                    type="button"
                    class="map-shell__pin"
                    style="left:${x}%; top:${y}%; background:${this.escapeHtml(this.categoryColor(this.locationCategoryKey(location)))};"
                    title="${location.location_name ?? 'Local'}"
                >
                    <span>${this.escapeHtml(this.markerLabelText(location) || String(index + 1))}</span>
                </button>
            `;
        }).join('');

        this.canvasTarget.innerHTML = `
            <div class="map-shell__grid"></div>
            ${points}
        `;
    }

    setStatus(message) {
        this.statusTarget.textContent = message;
        if (this.hasStatusDuplicateTarget) {
            this.statusDuplicateTarget.textContent = message;
        }
    }

    updateCounts(count) {
        const normalized = String(count);
        if (this.hasCountTarget) {
            this.countTarget.textContent = normalized;
        }
        if (this.hasCountDuplicateTarget) {
            this.countDuplicateTarget.textContent = normalized;
        }
    }

    async refreshAddresses() {
        const payload = await this.requestJson(this.addressesUrlValue, { method: 'GET' });
        this.savedAddresses = Array.isArray(payload.data) ? payload.data : [];
        this.renderAddressesSummary();
    }

    renderFavoritesSummary() {
        const count = String(this.favoriteLocationIds.length);

        if (this.hasFavoritesCountTarget) {
            this.favoritesCountTarget.textContent = count;
        }
        if (this.hasFavoritesCountDuplicateTarget) {
            this.favoritesCountDuplicateTarget.textContent = count;
        }
        if (this.hasFavoritesListTarget) {
            if (this.favoriteLocationIds.length === 0) {
                this.favoritesListTarget.innerHTML = '<div class="public-home__empty-card">Todavía no has guardado ningún local.</div>';
                return;
            }

            this.favoritesListTarget.innerHTML = this.favoriteLocationIds
                .slice()
                .sort((left, right) => right - left)
                .map((locationId) => {
                    const location = this.currentLocations.find((candidate) => Number(candidate.location_id) === locationId) ?? null;
                    const title = location?.location_name ?? `Local #${locationId}`;
                    const subtitle = location ? this.cardSubtitle(location) : 'Guardado desde la exploración pública.';

                    return `
                    <article class="public-home__saved-row">
                        <div>
                            <strong>${this.escapeHtml(title)}</strong>
                            <p>${this.escapeHtml(subtitle)}</p>
                        </div>
                        <button
                            type="button"
                            class="public-home__inline-button"
                            data-action="map-shell#removeFavoriteFromList"
                            data-location-id="${locationId}"
                        >
                            Quitar
                        </button>
                    </article>
                `;
                })
                .join('');
        }
    }

    renderAddressesSummary() {
        const count = String(this.savedAddresses.length);

        if (this.hasAddressesCountTarget) {
            this.addressesCountTarget.textContent = count;
        }
        if (this.hasAddressesCountDuplicateTarget) {
            this.addressesCountDuplicateTarget.textContent = count;
        }
        if (this.hasAddressesListTarget) {
            if (this.savedAddresses.length === 0) {
                this.addressesListTarget.innerHTML = '<div class="public-home__empty-card">Todavía no tienes direcciones guardadas.</div>';
                return;
            }

            this.addressesListTarget.innerHTML = this.savedAddresses.map((address) => `
                <article class="public-home__saved-row">
                    <div>
                        <strong>${address.label ?? 'Sin etiqueta'}</strong>
                        <p>${this.addressLine(address)}</p>
                    </div>
                    <div class="public-home__saved-actions">
                        ${address.is_primary ? '<span class="public-home__badge">Principal</span>' : ''}
                        ${address.latitude && address.longitude ? `<button
                            type="button"
                            class="public-home__inline-button"
                            data-action="click->map-shell#selectSavedAddress"
                            data-address-id="${this.escapeHtml(String(address.id ?? ''))}"
                            data-lat="${this.escapeHtml(String(address.latitude ?? ''))}"
                            data-lng="${this.escapeHtml(String(address.longitude ?? ''))}"
                            data-label="${this.escapeHtml(address.label ?? 'Ubicación guardada')}"
                        >
                            Usar
                        </button>` : ''}
                        <button
                            type="button"
                            class="public-home__inline-button"
                            data-action="click->map-shell#removeAddressFromList"
                            data-address-id="${this.escapeHtml(String(address.id ?? ''))}"
                        >
                            Quitar
                        </button>
                    </div>
                </article>
            `).join('');
        }
    }

    syncFavoriteButtons() {
        this.element.querySelectorAll('[data-location-id]').forEach((element) => {
            const locationId = Number.parseInt(element.dataset.locationId ?? '', 10);
            if (Number.isNaN(locationId) || !element.classList.contains('mobile-map-card__heart')) {
                return;
            }

            const isFavorite = this.favoriteLocationIds.includes(locationId);
            element.classList.toggle('is-active', isFavorite);
        });
    }

    async renderGoogleMap(locations, options = {}) {
        const google = await this.loadGoogleMaps();
        await this.afterLayoutSettles();

        if (!this.map) {
            this.canvasTarget.innerHTML = '';
            this.map = new google.maps.Map(this.canvasTarget, {
                center: { lat: 19.432608, lng: -99.133209 },
                zoom: 12,
                mapTypeId: this.currentMapTypeId,
                disableDefaultUI: true,
                clickableIcons: false,
                gestureHandling: 'greedy',
                styles: [
                    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                    { featureType: 'transit.station', stylers: [{ saturation: -40 }] },
                    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#b3c3d4' }] },
                    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#425466' }] },
                    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d9eef9' }] },
                    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f8f3e8' }] },
                ],
            });
            this.infoWindow = new google.maps.InfoWindow();
            this.initializeMapDiscoveryListener(google);
        }

        this.map.setMapTypeId(this.currentMapTypeId);

        this.isSyncingMapViewport = true;
        this.markers.forEach((marker) => marker.setMap(null));
        this.markers = [];
        if (this.userMarker) {
            this.userMarker.setMap(null);
            this.userMarker = null;
        }

        const validLocations = locations.filter((location) => Number.isFinite(location.lat) && Number.isFinite(location.lng));
        const hasUserCoordinates = this.hasUserCoordinates();
        if (validLocations.length === 0) {
            if (hasUserCoordinates) {
                const userPosition = this.currentUserPosition();
                this.userMarker = new google.maps.Marker({
                    map: this.map,
                    position: userPosition,
                    title: 'Tu ubicación',
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 9,
                        fillColor: '#f27f0d',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 3,
                    },
                });
                this.map.setCenter(userPosition);
                this.map.setZoom(14);
                this.rememberCurrentMapCenter();
                this.isSyncingMapViewport = false;
                this.setCanvasNote(locations.length === 0
                    ? 'Ya ubicamos tu zona, pero todavía no hay locales visibles publicados.'
                    : 'Ubicamos tu zona, pero los locales visibles aún no traen coordenadas publicadas.');
                return;
            }

            this.map.setCenter({ lat: 19.432608, lng: -99.133209 });
            this.map.setZoom(11);
            this.rememberCurrentMapCenter();
            this.isSyncingMapViewport = false;
            this.setCanvasNote(locations.length === 0
                ? 'Todavía no hay locales visibles publicados en el feed.'
                : 'El feed devolvió locales, pero todavía no tienen coordenadas válidas para dibujarse.');
            return;
        }

        const bounds = new google.maps.LatLngBounds();

        validLocations.forEach((location) => {
            const position = { lat: Number(location.lat), lng: Number(location.lng) };
            const marker = new google.maps.Marker({
                map: this.map,
                position,
                title: location.location_name ?? 'Local',
                animation: google.maps.Animation.DROP,
                icon: this.markerIcon(google, location),
                label: this.markerLabel(location),
            });

            marker.addListener('click', async () => {
                this.setSelectedLocation(this.locationKey(location));
                const enrichedLocation = await this.enrichLocationIfNeeded(location);
                this.openInfoWindow(enrichedLocation, marker);
            });

            this.markers.push(marker);
            bounds.extend(position);
        });

        if (hasUserCoordinates) {
            const userPosition = this.currentUserPosition();
            this.userMarker = new google.maps.Marker({
                map: this.map,
                position: userPosition,
                title: 'Tu ubicación',
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: '#f27f0d',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3,
                },
            });
            bounds.extend(userPosition);
        }

        if (options.preserveViewport) {
            // Keep the user's current viewport while augmenting nearby discoveries.
        } else if (hasUserCoordinates && validLocations.length > 0) {
            this.map.fitBounds(bounds, 60);
        } else if (hasUserCoordinates) {
            this.map.setCenter(this.currentUserPosition());
            this.map.setZoom(15);
        } else if (validLocations.length === 1) {
            this.map.setCenter(bounds.getCenter());
            this.map.setZoom(15);
        } else {
            this.map.fitBounds(bounds, 60);
        }

        this.googleMapsReady = true;
        this.refreshMapViewport();
        this.rememberCurrentMapCenter();
        window.setTimeout(() => {
            this.isSyncingMapViewport = false;
        }, 180);
        this.setCanvasNote('');
    }

    focusMapLocation(location) {
        const marker = this.markers.find((candidate) => {
            const position = candidate.getPosition();
            return position
                && Math.abs(position.lat() - Number(location.lat)) < 0.000001
                && Math.abs(position.lng() - Number(location.lng)) < 0.000001;
        });

        if (!marker || !this.map) {
            return;
        }

        this.isSyncingMapViewport = true;
        this.map.panTo(marker.getPosition());
        this.map.setZoom(16);
        this.openInfoWindow(location, marker);
        window.setTimeout(() => {
            this.rememberCurrentMapCenter();
            this.isSyncingMapViewport = false;
        }, 180);
    }

    openInfoWindow(location, marker) {
        if (!this.infoWindow) {
            return;
        }

        this.infoWindow.setContent(this.infoWindowMarkup(location));
        this.infoWindow.open({
            anchor: marker,
            map: this.map,
        });
        this.setStatus(`Mostrando ${location.location_name ?? 'local seleccionado'} en el mapa.`);
        this.renderDetailSheet(location);
    }

    initializeMapDiscoveryListener(google) {
        if (!this.map) {
            return;
        }

        google.maps.event.addListener(this.map, 'idle', () => {
            if (this.mapIdleTimer) {
                window.clearTimeout(this.mapIdleTimer);
            }

            this.mapIdleTimer = window.setTimeout(() => {
                this.discoverPlacesFromViewport();
            }, 420);
        });
    }

    async discoverPlacesFromViewport() {
        if (!this.map || this.isSyncingMapViewport || this.isDiscoveringPlaces) {
            return;
        }

        const center = this.map.getCenter();
        if (!center) {
            return;
        }

        const centerPosition = {
            lat: center.lat(),
            lng: center.lng(),
        };

        this.currentLocations.forEach(loc => {
            const lat = loc.latitude ?? loc.lat;
            const lng = loc.longitude ?? loc.lng;
            if (lat !== undefined && lng !== undefined) {
                loc.distance_meters = this.distanceMeters(centerPosition.lat, centerPosition.lng, lat, lng);
            }
        });
        this.currentLocations.sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity));
        
        this.visibleLocations = this.filteredLocations(this.currentLocations);
        this.renderList(this.visibleLocations);

        if (!this.shouldFetchGooglePlaces()) {
            return;
        }

        if (this.lastDiscoveryCenter) {
            const traveledMeters = this.distanceMeters(
                this.lastDiscoveryCenter.lat,
                this.lastDiscoveryCenter.lng,
                centerPosition.lat,
                centerPosition.lng,
            );

            if (traveledMeters < 320) {
                return;
            }
        }

        this.isDiscoveringPlaces = true;

        try {
            const googleLocations = await this.fetchNearbyPlacesFallback(centerPosition);
            if (googleLocations.length === 0) {
                this.lastDiscoveryCenter = centerPosition;
                return;
            }

            const mergedLocations = this.mergeLocationsWithGooglePlaces(this.currentLocations, googleLocations);
            if (mergedLocations.length === this.currentLocations.length) {
                this.lastDiscoveryCenter = centerPosition;
                return;
            }

            this.currentLocations = mergedLocations;
            this.currentFeedSource = mergedLocations.some((location) => location.source_type !== 'google_places')
                ? 'hybrid'
                : 'places_fallback';
            this.renderCategoryChips(mergedLocations);
            this.visibleLocations = this.filteredLocations(mergedLocations);
            this.updateCounts(this.visibleLocations.length);
            this.renderList(this.visibleLocations);
            await this.renderCanvas(this.visibleLocations, { preserveViewport: true });
            this.syncFavoriteButtons();
            this.syncActiveCard();
            this.refreshDetailSheet();
            this.lastDiscoveryCenter = centerPosition;
            this.setStatus('Descubrimos más locales en esta zona del mapa.');
        } catch (error) {
            this.setStatus(`No pude descubrir más locales en esta zona: ${error.message}`);
        } finally {
            this.isDiscoveringPlaces = false;
        }
    }

    rememberCurrentMapCenter() {
        if (!this.map) {
            return;
        }

        const center = this.map.getCenter();
        if (!center) {
            return;
        }

        this.lastDiscoveryCenter = {
            lat: center.lat(),
            lng: center.lng(),
        };
    }

    async loadGoogleMaps() {
        if (window.google?.maps) {
            this.googleMapsReady = true;
            return window.google;
        }

        if (window.__miMonchisGoogleMapsPromise) {
            await window.__miMonchisGoogleMapsPromise;
            this.googleMapsReady = true;
            return window.google;
        }

        window.__miMonchisGoogleMapsPromise = new Promise((resolve, reject) => {
            const callbackName = '__miMonchisInitGoogleMaps';
            const existingScript = document.querySelector('script[data-google-maps-loader="true"]');
            if (existingScript) {
                if (window.google?.maps) {
                    resolve(window.google);
                    return;
                }

                if (existingScript.dataset.loaded === 'true') {
                    reject(new Error('Google Maps ya marcó el script como cargado, pero window.google.maps no está disponible.'));
                    return;
                }

                existingScript.addEventListener('load', () => resolve(window.google));
                existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar el script de Google Maps.')));
                return;
            }

            window[callbackName] = () => {
                script.dataset.loaded = 'true';
                resolve(window.google);
                delete window[callbackName];
            };

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.googleMapsApiKeyValue)}&callback=${callbackName}&loading=async&libraries=places&language=es&region=MX`;
            script.async = true;
            script.defer = true;
            script.dataset.googleMapsLoader = 'true';
            script.onerror = () => {
                reject(new Error('La carga remota de Google Maps falló.'));
                delete window[callbackName];
            };
            document.head.appendChild(script);
        });

        await window.__miMonchisGoogleMapsPromise;
        this.googleMapsReady = true;
        return window.google;
    }

    initializeWalkthrough() {
        if (!this.hasWalkthroughTarget || !this.walkthroughEnabledValue || this.hasSeenWalkthrough()) {
            if (this.hasWalkthroughTarget) {
                this.walkthroughTarget.classList.add('is-hidden');
            }
            this.element.classList.remove('is-walkthrough-active');

            return false;
        }

        this.element.classList.add('is-walkthrough-active');
        this.walkthroughTarget.classList.remove('is-hidden');
        this.walkthroughTarget.classList.add('is-visible');
        this.runWalkthroughSequence();
        return true;
    }

    runWalkthroughSequence() {
        const message = '¿estás listo para explorar tu antojo?';
        let index = 0;

        const typeNextCharacter = () => {
            if (!this.hasWalkthroughCopyTarget) {
                return;
            }

            this.walkthroughCopyTarget.textContent = message.slice(0, index);

            if (index < message.length) {
                index += 1;
                this.walkthroughTypingTimer = window.setTimeout(typeNextCharacter, 52);
                return;
            }

            window.setTimeout(() => {
                this.walkthroughFormTarget.classList.remove('is-hidden');
                this.walkthroughFormTarget.classList.add('is-visible');
            }, 160);

            window.setTimeout(() => {
                this.walkthroughGeoButtonTarget.classList.remove('is-hidden');
                this.walkthroughGeoButtonTarget.classList.add('is-visible');
            }, 560);

            window.setTimeout(() => {
                this.walkthroughLogoTarget.classList.remove('is-hidden');
                this.walkthroughLogoTarget.classList.add('is-visible');
            }, 980);
        };

        typeNextCharacter();
    }

    hasSeenWalkthrough() {
        try {
            return window.localStorage.getItem('mi_monchis_walkthrough_seen') === '1';
        } catch (error) {
            return false;
        }
    }

    async completeWalkthrough() {
        try {
            window.localStorage.setItem('mi_monchis_walkthrough_seen', '1');
        } catch (error) {
            // Ignore localStorage issues for demo mode.
        }

        if (!this.hasWalkthroughTarget) {
            return;
        }

        this.walkthroughTarget.classList.remove('is-visible');
        this.walkthroughTarget.classList.add('is-leaving');

        await new Promise((resolve) => window.setTimeout(resolve, 420));
        this.walkthroughTarget.classList.add('is-hidden');
        this.walkthroughTarget.classList.remove('is-leaving');
        this.element.classList.remove('is-walkthrough-active');
        await this.afterLayoutSettles();
    }

    async fetchPlacePredictions(query) {
        const google = await this.loadGoogleMaps();
        if (!google.maps.places?.AutocompleteService) {
            throw new Error('La librería de Places no está disponible. Activa Places API para usar sugerencias de dirección.');
        }

        const service = this.autocompleteService ?? new google.maps.places.AutocompleteService();
        this.autocompleteService = service;

        return new Promise((resolve, reject) => {
            service.getPlacePredictions({
                input: query,
                componentRestrictions: { country: 'mx' },
                types: ['geocode'],
                language: 'es',
            }, (predictions, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && Array.isArray(predictions)) {
                    resolve(predictions.slice(0, 5).map((prediction) => ({
                        description: prediction.description ?? '',
                        placeId: prediction.place_id ?? '',
                        primaryText: prediction.structured_formatting?.main_text ?? '',
                        secondaryText: prediction.structured_formatting?.secondary_text ?? '',
                    })));
                    return;
                }

                if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                    resolve([]);
                    return;
                }

                reject(new Error(this.googlePlacesStatusMessage(status)));
            });
        });
    }

    async fetchPlaceDetails(placeId) {
        const google = await this.loadGoogleMaps();
        const service = this.googlePlacesService(google);

        return new Promise((resolve, reject) => {
            service.getDetails({
                placeId,
                fields: ['geometry.location', 'formatted_address'],
                language: 'es',
                region: 'MX',
            }, (place, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
                    reject(new Error(this.googlePlacesStatusMessage(status)));
                    return;
                }

                resolve({
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                });
            });
        });
    }

    async fetchGooglePlaceEnrichment(placeId) {
        const google = await this.loadGoogleMaps();
        const service = this.googlePlacesService(google);

        return new Promise((resolve, reject) => {
            service.getDetails({
                placeId,
                fields: [
                    'current_opening_hours',
                    'formatted_address',
                    'formatted_phone_number',
                    'geometry.location',
                    'name',
                    'opening_hours',
                    'photos',
                    'rating',
                    'reviews',
                    'types',
                    'user_ratings_total',
                    'website',
                ],
                language: 'es',
                region: 'MX',
            }, (place, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
                    reject(new Error(this.googlePlacesStatusMessage(status)));
                    return;
                }

                const lat = place.geometry?.location?.lat?.();
                const lng = place.geometry?.location?.lng?.();
                const photoUrl = Array.isArray(place.photos) && place.photos[0]?.getUrl
                    ? place.photos[0].getUrl({ maxWidth: 1400, maxHeight: 1000 })
                    : null;

                resolve({
                    lat: Number.isFinite(lat) ? Number(lat) : null,
                    lng: Number.isFinite(lng) ? Number(lng) : null,
                    short_address: place.formatted_address ?? null,
                    open_now: typeof place.current_opening_hours?.open_now === 'boolean'
                        ? place.current_opening_hours.open_now
                        : (typeof place.opening_hours?.open_now === 'boolean' ? place.opening_hours.open_now : null),
                    opening_hours_text: Array.isArray(place.current_opening_hours?.weekday_text)
                        ? place.current_opening_hours.weekday_text
                        : (Array.isArray(place.opening_hours?.weekday_text) ? place.opening_hours.weekday_text : []),
                    rating: typeof place.rating === 'number' ? place.rating : null,
                    user_ratings_total: typeof place.user_ratings_total === 'number' ? place.user_ratings_total : null,
                    photo_url: photoUrl,
                    types: Array.isArray(place.types) ? place.types : [],
                    google_reviews: Array.isArray(place.reviews) ? place.reviews.slice(0, 3).map((review) => ({
                        author_name: review.author_name ?? 'Google',
                        rating: typeof review.rating === 'number' ? review.rating : null,
                        text: review.text ?? '',
                    })) : [],
                    google_phone_number: place.formatted_phone_number ?? null,
                    google_website: place.website ?? null,
                });
            });
        });
    }

    googlePlacesService(google = window.google) {
        if (!google?.maps?.places?.PlacesService) {
            throw new Error('La librería de Places no está disponible. Activa Places API para usar sugerencias de dirección.');
        }

        const serviceNode = this.placeDetailsNode ?? document.createElement('div');
        this.placeDetailsNode = serviceNode;
        const service = this.placeDetailsService ?? new google.maps.places.PlacesService(serviceNode);
        this.placeDetailsService = service;
        return service;
    }

    async fetchNearbyPlacesFallback(searchCenter = null) {
        const userPosition = this.currentUserPosition();
        const center = searchCenter && Number.isFinite(searchCenter.lat) && Number.isFinite(searchCenter.lng)
            ? searchCenter
            : userPosition;
            
        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
            return [];
        }

        const category = this.activeCategoryFilter && this.activeCategoryFilter !== 'Todos' ? this.activeCategoryFilter : 'Todos';

        try {
            const response = await fetch(`/api/explore/places?lat=${center.lat}&lng=${center.lng}&category=${encodeURIComponent(category)}`);
            if (!response.ok) {
                return [];
            }
            const payload = await response.json();
            if (!payload.data || !Array.isArray(payload.data)) {
                return [];
            }
            
            return payload.data.map((place) => {
                return {
                    ...place,
                    selection_key: place.location_id,
                    distance_meters: this.distanceMeters(userPosition.lat, userPosition.lng, place.lat, place.lng),
                    lat: place.lat,
                    lng: place.lng,
                };
            }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
        } catch (error) {
            console.error('Error fetching proxy places:', error);
            return [];
        }
    }

    async resolveWalkthroughSelection(address) {
        if (this.walkthroughSelection && this.walkthroughAddressInputTarget.value.trim() === this.walkthroughSelection.description) {
            return this.walkthroughSelection;
        }

        const predictions = this.walkthroughPredictions.length > 0
            ? this.walkthroughPredictions
            : await this.fetchPlacePredictions(address);

        if (predictions.length === 0) {
            throw new Error('No encontré una colonia o dirección coincidente. Intenta con calle, número o colonia.');
        }

        const firstPrediction = predictions[0];
        const details = await this.fetchPlaceDetails(firstPrediction.placeId);

        this.walkthroughAddressInputTarget.value = firstPrediction.description;

        return {
            lat: details.lat,
            lng: details.lng,
            label: firstPrediction.primaryText || firstPrediction.description,
            description: firstPrediction.description,
            placeId: firstPrediction.placeId,
        };
    }

    requestGeolocation() {
        if (!('geolocation' in navigator)) {
            throw new Error('Tu navegador no soporta geolocalización.');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve(position.coords),
                (error) => reject(error),
                {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 60000,
                },
            );
        });
    }

    applyCoordinates(latitude, longitude) {
        if (this.hasAddressLatInputTarget) {
            this.addressLatInputTarget.value = Number(latitude).toFixed(6);
        }
        if (this.hasAddressLngInputTarget) {
            this.addressLngInputTarget.value = Number(longitude).toFixed(6);
        }

        this.latValue = Number(latitude);
        this.lngValue = Number(longitude);
        this.persistLocationContext();
    }

    setWalkthroughError(message) {
        if (!this.hasWalkthroughErrorTarget) {
            return;
        }

        if (message === '') {
            this.walkthroughErrorTarget.textContent = '';
            this.walkthroughErrorTarget.classList.add('is-hidden');
            return;
        }

        this.walkthroughErrorTarget.textContent = message;
        this.walkthroughErrorTarget.classList.remove('is-hidden');
    }

    renderWalkthroughSuggestions() {
        if (!this.hasWalkthroughSuggestionsTarget) {
            return;
        }

        if (this.walkthroughPredictions.length === 0) {
            this.hideWalkthroughSuggestions();
            return;
        }

        const selectedPlaceId = this.walkthroughSelection?.description === this.walkthroughAddressInputTarget.value.trim()
            ? this.walkthroughSelection?.placeId
            : null;

        this.walkthroughSuggestionsTarget.innerHTML = this.walkthroughPredictions.map((prediction) => `
            <button
                type="button"
                class="welcome-flow__suggestion ${prediction.placeId === selectedPlaceId ? 'is-active' : ''}"
                data-action="mousedown->map-shell#selectWalkthroughSuggestion"
                data-place-id="${this.escapeHtml(prediction.placeId)}"
            >
                <span class="welcome-flow__suggestion-main">${this.escapeHtml(prediction.primaryText || prediction.description)}</span>
                <span class="welcome-flow__suggestion-secondary">${this.escapeHtml(prediction.secondaryText || '')}</span>
            </button>
        `).join('');
        this.walkthroughSuggestionsTarget.classList.remove('is-hidden');
    }

    hideWalkthroughSuggestions() {
        if (!this.hasWalkthroughSuggestionsTarget) {
            return;
        }

        this.walkthroughSuggestionsTarget.innerHTML = '';
        this.walkthroughSuggestionsTarget.classList.add('is-hidden');
    }

    updateHeroLocation(label) {
        if (this.hasHeroLocationTarget && label) {
            this.heroLocationTarget.textContent = label;
        }
        if (this.hasHeroLocationDesktopTarget && label) {
            this.heroLocationDesktopTarget.textContent = label;
        }
        if (label) {
            this.currentLocationLabel = label;
            this.persistLocationContext();
        }
    }

    googlePlacesStatusMessage(status) {
        const normalizedStatus = String(status ?? '').toUpperCase();

        if (normalizedStatus === 'REQUEST_DENIED') {
            return 'Tu API key sí carga el mapa, pero no tiene autorizado Places API. Actívalo en Google Cloud Console y añade Places API a las restricciones de la llave.';
        }

        if (normalizedStatus === 'ZERO_RESULTS') {
            return 'No encontré una colonia o dirección coincidente. Intenta con calle, número o colonia.';
        }

        if (normalizedStatus === 'INVALID_REQUEST') {
            return 'La búsqueda de dirección llegó incompleta. Escribe al menos una colonia, calle o referencia.';
        }

        if (normalizedStatus === 'OVER_QUERY_LIMIT') {
            return 'Google Places alcanzó el límite de consultas para esta llave.';
        }

        return 'No pude obtener sugerencias de dirección desde Google Places.';
    }

    infoWindowMarkup(location) {
        const locationName = this.escapeHtml(location.location_name ?? 'Local sin nombre');
        const merchantName = this.escapeHtml(location.merchant_name ?? 'Merchant');
        const address = this.escapeHtml(location.short_address ?? 'Dirección pendiente');
        const statusLabel = this.escapeHtml(this.publicationStatusLabel(location));
        const statusClass = this.infoWindowStatusClass(location);
        const distanceLabel = location.distance_meters != null ? this.escapeHtml(this.formatDistance(location.distance_meters)) : 'Zona cercana';
        const sourceLabel = this.escapeHtml(this.sourceTypeLabel(location.source_type));
        const directionsUrl = this.buildDirectionsUrl(location);
        const whatsappUrl = this.buildWhatsAppUrl(location.whatsapp_enabled, location.whatsapp_e164);
        const reviewsLabel = this.escapeHtml(this.reviewsLabel(location));
        const sourceBadgeClass = this.sourceBadgeClass(location);
        const hoursSummary = this.openingHoursSummary(location);
        const reviewSnippet = this.reviewSnippet(location);
        const categoryKey = this.locationCategoryKey(location);
        const categoryMarkup = categoryKey !== 'all'
            ? `<span class="map-shell__info-window-badge map-shell__info-window-badge--category" style="--category-accent:${this.escapeHtml(this.categoryColor(categoryKey))};">${this.escapeHtml(this.categoryDisplayName(categoryKey))}</span>`
            : '';
        const claimUrl = this.buildClaimUrl(location);
        const detailKey = this.escapeHtml(this.locationKey(location));

        return `
            <article class="map-shell__info-window">
                <header class="map-shell__info-window-header">
                    <div>
                        <strong>${locationName}</strong>
                        <p class="map-shell__info-window-merchant">${merchantName}</p>
                    </div>
                    <div class="map-shell__info-window-badge-stack">
                        ${categoryMarkup}
                        ${this.locationIsJoyita(location) ? '<span class="map-shell__info-window-badge map-shell__info-window-badge--joyita">Joyita</span>' : ''}
                        <span class="map-shell__info-window-badge map-shell__info-window-badge--source ${sourceBadgeClass}">${sourceLabel}</span>
                        <span class="map-shell__info-window-badge ${statusClass}">${statusLabel}</span>
                    </div>
                </header>
                <p class="map-shell__info-window-address">${address}</p>
                <div class="map-shell__info-window-meta">
                    <span>${distanceLabel}</span>
                    <span>${reviewsLabel}</span>
                </div>
                ${hoursSummary ? `<p class="map-shell__info-window-detail">${this.escapeHtml(hoursSummary)}</p>` : ''}
                ${reviewSnippet ? `<p class="map-shell__info-window-review">${this.escapeHtml(reviewSnippet)}</p>` : ''}
                <div class="map-shell__info-window-actions">
                    <button type="button" data-action="click->map-shell#openLocationFromInfoWindow" data-location-key="${detailKey}">Ver ficha</button>
                    ${directionsUrl ? `<a href="${this.escapeHtml(directionsUrl)}" target="_blank" rel="noreferrer">Cómo llegar</a>` : ''}
                    ${whatsappUrl ? `<a href="${this.escapeHtml(whatsappUrl)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
                    ${claimUrl ? `<a href="${this.escapeHtml(claimUrl)}">Reclamar</a>` : ''}
                </div>
            </article>
        `;
    }

    publicationStatusLabel(location) {
        if (location.source_type === 'google_places') {
            if (this.locationIsOpen(location) === true) {
                return 'Abierto';
            }

            if (this.locationIsOpen(location) === false) {
                return 'Cerrado';
            }

            return 'Disponible';
        }

        if (location.publication_state === 'public_visible') {
            return 'Disponible';
        }

        if (location.publication_state === 'fallback_visible') {
            return 'Disponible';
        }

        return 'Pendiente';
    }

    publicationStatusClass(location) {
        if (location.source_type === 'google_places') {
            if (this.locationIsOpen(location) === false) {
                return 'mobile-map-card__status--closed';
            }

            return 'mobile-map-card__status--discovered';
        }

        if (location.publication_state === 'public_visible') {
            return ''; // Default green
        }

        if (location.publication_state === 'fallback_visible') {
            return 'mobile-map-card__status--discovered';
        }

        // For 'pending_visible' or any other state
        return 'mobile-map-card__status--pending';
    }

    sourceTypeLabel(sourceType) {
        if (['owner_registered', 'claimed', 'admin_curated'].includes(sourceType)) {
            return 'Real';
        }

        if (sourceType === 'fake_seed') {
            return 'Demo';
        }

        if (sourceType === 'google_places') {
            return 'Google';
        }

        return 'Mi Monchis';
    }

    sourceBadgeClass(location) {
        if (['owner_registered', 'claimed', 'admin_curated'].includes(location.source_type)) {
            return 'source-badge--real';
        }

        if (location.source_type === 'fake_seed') {
            return 'source-badge--demo';
        }

        if (location.source_type === 'google_places') {
            return 'source-badge--google';
        }

        return 'source-badge--default';
    }

    infoWindowStatusClass(location) {
        if (location.source_type === 'google_places' && this.locationIsOpen(location) === false) {
            return 'map-shell__info-window-badge--closed';
        }

        return 'map-shell__info-window-badge--open';
    }

    locationCategoryKey(location) {
        if (location.category_slug) {
            return String(location.category_slug);
        }

        const types = Array.isArray(location.types) ? location.types.map((type) => String(type).toLowerCase()) : [];
        const mappedCatalogCategory = this.inferCatalogCategoryFromTypes(types) || this.inferCatalogCategoryFromText(location);
        if (mappedCatalogCategory) {
            return mappedCatalogCategory;
        }

        if (types.some((type) => ['meal_takeaway', 'mexican_restaurant', 'taco_restaurant'].includes(type))) {
            return 'tacos';
        }

        if (types.some((type) => ['vegetarian_restaurant', 'vegan_restaurant'].includes(type))) {
            return 'veggie';
        }

        if (types.some((type) => ['cafe', 'bakery', 'coffee_shop'].includes(type))) {
            return 'cafe';
        }

        if (types.some((type) => ['restaurant', 'food', 'meal_delivery'].includes(type))) {
            return 'comida';
        }

        const haystack = [
            location.location_name,
            location.merchant_name,
            location.short_address,
            location.source_type,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        if (haystack.includes('taco') || haystack.includes('taquer')) {
            return 'tacos';
        }

        if (haystack.includes('veggie') || haystack.includes('vegetar') || haystack.includes('vegano') || haystack.includes('ensalada')) {
            return 'veggie';
        }

        if (haystack.includes('cafe') || haystack.includes('cafeter') || haystack.includes('coffee')) {
            return 'cafe';
        }

        return 'all';
    }

    registerCategoryCatalog(catalog) {
        this.categoryCatalog = Array.isArray(catalog)
            ? catalog
                .filter((category) => category && category.slug)
                .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
            : [];
        this.categoryCatalogBySlug = new Map(this.categoryCatalog.map((category) => [String(category.slug), category]));
    }

    categoryDisplayName(categoryKey) {
        if (categoryKey === 'all') {
            return 'Todos';
        }

        return this.categoryInfo(categoryKey).label;
    }

    categoryColor(categoryKey) {
        if (categoryKey === 'all') {
            return '#F97316';
        }

        return this.categoryInfo(categoryKey).colorHex;
    }

    categoryInfo(categoryKey) {
        const catalogCategory = this.categoryCatalogBySlug.get(String(categoryKey));
        if (catalogCategory) {
            return {
                label: String(catalogCategory.name ?? this.labelFromSlug(String(categoryKey))),
                colorHex: String(catalogCategory.color_hex ?? '#CBD5E1'),
                iconKey: String(catalogCategory.icon_key ?? ''),
            };
        }

        const fallback = this.fallbackCategoryDefinitions[String(categoryKey)];
        if (fallback) {
            return fallback;
        }

        return {
            label: this.labelFromSlug(String(categoryKey)),
            colorHex: '#CBD5E1',
            iconKey: '',
        };
    }

    inferCatalogCategoryFromTypes(types) {
        if (!Array.isArray(types) || types.length === 0) {
            return null;
        }

        for (const category of this.categoryCatalog) {
            const mappings = Array.isArray(category.google_place_type_mappings) ? category.google_place_type_mappings.map((value) => String(value).toLowerCase()) : [];
            if (mappings.some((mappedType) => types.includes(mappedType))) {
                return String(category.slug);
            }
        }

        if (types.some((type) => ['meal_takeaway', 'mexican_restaurant', 'taco_restaurant'].includes(type))) {
            return this.findCatalogSlugByKeywords(['taco', 'taqu']);
        }

        if (types.some((type) => ['vegetarian_restaurant', 'vegan_restaurant'].includes(type))) {
            return this.findCatalogSlugByKeywords(['veggie', 'veget', 'veg']);
        }

        if (types.some((type) => ['cafe', 'bakery', 'coffee_shop'].includes(type))) {
            return this.findCatalogSlugByKeywords(['cafe', 'caf', 'coffee']);
        }

        if (types.some((type) => ['restaurant', 'food', 'meal_delivery'].includes(type))) {
            return this.findCatalogSlugByKeywords(['comida', 'rest', 'food']);
        }

        return null;
    }

    inferCatalogCategoryFromText(location) {
        const haystack = [
            location.location_name,
            location.merchant_name,
            location.short_address,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        if (haystack.includes('taco') || haystack.includes('taquer')) {
            return this.findCatalogSlugByKeywords(['taco', 'taqu']);
        }

        if (haystack.includes('veggie') || haystack.includes('vegetar') || haystack.includes('vegano')) {
            return this.findCatalogSlugByKeywords(['veggie', 'veget', 'veg']);
        }

        if (haystack.includes('cafe') || haystack.includes('cafeter') || haystack.includes('coffee')) {
            return this.findCatalogSlugByKeywords(['cafe', 'caf', 'coffee']);
        }

        return null;
    }

    findCatalogSlugByKeywords(keywords) {
        for (const category of this.categoryCatalog) {
            const haystack = this.normalizeComparisonText(`${category.slug ?? ''} ${category.name ?? ''}`);
            if (keywords.some((keyword) => haystack.includes(this.normalizeComparisonText(keyword)))) {
                return String(category.slug);
            }
        }

        return null;
    }

    labelFromSlug(slug) {
        return String(slug)
            .split('-')
            .filter(Boolean)
            .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
            .join(' ');
    }

    categoryTagMarkup(location) {
        const categoryKey = this.locationCategoryKey(location);
        if (categoryKey === 'all') {
            return '';
        }

        return `
            <div class="mobile-map-card__category">
                <span class="mobile-map-card__category-dot" style="background:${this.escapeHtml(this.categoryColor(categoryKey))};"></span>
                <span>${this.escapeHtml(this.categoryDisplayName(categoryKey))}</span>
            </div>
        `;
    }

    locationIsJoyita(location) {
        return location.is_joyita === true || location.gem_status === 'approved';
    }

    locationSourceGroup(location) {
        return location.source_type === 'google_places' ? 'google' : 'mimonchis';
    }

    joyitaBadgeMarkup(location) {
        if (!this.locationIsJoyita(location)) {
            return '';
        }

        const tags = Array.isArray(location.gem_reason_tags) && location.gem_reason_tags.length > 0
            ? ` · ${location.gem_reason_tags.slice(0, 2).map((tag) => this.escapeHtml(tag)).join(' · ')}`
            : '';

        return `<div class="mobile-map-card__joyita">Joyita${tags}</div>`;
    }

    markerIcon(google, location) {
        return {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: this.categoryColor(this.locationCategoryKey(location)),
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
        };
    }

    markerLabel(location) {
        return {
            text: this.markerLabelText(location),
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: '700',
        };
    }

    markerLabelText(location) {
        const categoryKey = this.locationCategoryKey(location);
        if (categoryKey !== 'all') {
            return this.categoryDisplayName(categoryKey).slice(0, 1).toUpperCase();
        }

        return String(location.merchant_name ?? location.location_name ?? 'L').slice(0, 1).toUpperCase();
    }

    buildDirectionsUrl(location) {
        const lat = Number(location.lat);
        const lng = Number(location.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
        }

        const destination = `${lat},${lng}`;
        const origin = this.hasUserCoordinates()
            ? `&origin=${encodeURIComponent(`${this.latValue},${this.lngValue}`)}`
            : '';

        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${origin}`;
    }

    buildWhatsAppUrl(isEnabled, e164) {
        if (!isEnabled || !e164) {
            return null;
        }

        const phone = String(e164).replace(/\D/g, '');
        if (phone === '') {
            return null;
        }

        return `https://wa.me/${phone}`;
    }

    buildClaimUrl(location) {
        const canClaim = location.source_type === 'google_places' || location.is_claimable === true;
        if (!canClaim || !this.hasClaimUrlValue || !this.claimUrlValue) {
            return null;
        }

        const url = new URL(this.claimUrlValue, window.location.origin);
        if (location.location_id != null) {
            url.searchParams.set('location_id', String(location.location_id));
        }
        if (location.place_id) {
            url.searchParams.set('place_id', String(location.place_id));
        }
        if (location.source_type) {
            url.searchParams.set('source_type', String(location.source_type));
        }
        if (location.location_name) {
            url.searchParams.set('location_name', String(location.location_name));
        }
        if (location.short_address) {
            url.searchParams.set('short_address', String(location.short_address));
        }
        if (Number.isFinite(Number(location.lat))) {
            url.searchParams.set('lat', String(location.lat));
        }
        if (Number.isFinite(Number(location.lng))) {
            url.searchParams.set('lng', String(location.lng));
        }
        if (location.category_slug) {
            url.searchParams.set('category_slug', String(location.category_slug));
        }

        return url.toString();
    }

    hasUserCoordinates() {
        return Number.isFinite(this.latValue) && Number.isFinite(this.lngValue);
    }

    currentUserPosition() {
        return {
            lat: Number(this.latValue),
            lng: Number(this.lngValue),
        };
    }

    renderNotificationsState() {
        if (!this.hasNotificationsPanelTarget) {
            return;
        }

        this.notificationsPanelTarget.classList.toggle('is-hidden', !this.notificationsOpen);
        if (this.hasNotificationsBadgeTarget) {
            this.notificationsBadgeTarget.textContent = '1';
            this.notificationsBadgeTarget.classList.toggle('is-hidden', this.notificationsOpen);
        }
    }

    renderLocationSwitcherState() {
        if (!this.hasLocationSwitcherTarget) {
            return;
        }

        this.locationSwitcherTarget.classList.toggle('is-hidden', !this.locationSwitcherOpen);

        if (this.locationSwitcherOpen) {
            const savedAddressesMarkup = this.savedAddresses.length > 0
                ? this.savedAddresses.map((address) => `
                    ${address.latitude && address.longitude ? `<button
                        type="button"
                        class="mobile-map-app__location-item"
                        data-action="click->map-shell#selectSavedAddress"
                        data-address-id="${this.escapeHtml(String(address.id ?? ''))}"
                        data-lat="${this.escapeHtml(String(address.latitude))}"
                        data-lng="${this.escapeHtml(String(address.longitude))}"
                        data-label="${this.escapeHtml(address.label)}"
                    >
                        <strong>${this.escapeHtml(address.label)}</strong>
                        <span>${this.escapeHtml(this.addressLine(address))}</span>
                    </button>` : `
                    <div class="mobile-map-app__location-item">
                        <strong>${this.escapeHtml(address.label)}</strong>
                        <span>${this.escapeHtml(this.addressLine(address))}</span>
                    </div>
                    `}
                `).join('')
                : '<p class="mobile-map-app__location-item">No tienes ubicaciones guardadas.</p>';

            // Aquí podrías añadir un enlace a un futuro flujo para agregar direcciones
            const addAddressMarkup = `
                <button type="button" class="mobile-map-app__location-item" data-action="click->map-shell#showAddressesSection">
                    <strong>Agregar nueva ubicación</strong>
                </button>
            `;

            this.locationSwitcherTarget.innerHTML = savedAddressesMarkup + addAddressMarkup;
        }
    }

    renderExploreMode() {
        const isMapMode = this.exploreMode !== 'list';

        if (this.hasMapStageTarget) {
            this.mapStageTarget.classList.toggle('is-hidden', !isMapMode);
        }
        if (this.hasExploreListTarget) {
            this.exploreListTarget.classList.toggle('is-hidden', isMapMode);
        }
        
        if (this.hasModeToggleButtonTarget) {
            const iconList = this.modeToggleButtonTarget.querySelector('.icon-list');
            const iconMap = this.modeToggleButtonTarget.querySelector('.icon-map');
            if (iconList) iconList.classList.toggle('is-hidden', !isMapMode);
            if (iconMap) iconMap.classList.toggle('is-hidden', isMapMode);
            this.modeToggleButtonTarget.classList.toggle('is-active', isMapMode);
        }
    }

    renderActiveSection() {
        const sections = {
            explore: this.hasExploreSectionTarget ? this.exploreSectionTarget : null,
            favorites: this.hasFavoritesSectionTarget ? this.favoritesSectionTarget : null,
            addresses: this.hasAddressesSectionTarget ? this.addressesSectionTarget : null,
            profile: this.hasProfileSectionTarget ? this.profileSectionTarget : null,
        };

        Object.entries(sections).forEach(([name, element]) => {
            if (!element) {
                return;
            }

            element.classList.toggle('is-hidden', name !== this.activeSection);
        });

        const tabs = {
            explore: this.hasExploreTabButtonTarget ? this.exploreTabButtonTarget : null,
            favorites: this.hasFavoritesTabButtonTarget ? this.favoritesTabButtonTarget : null,
            addresses: this.hasAddressesTabButtonTarget ? this.addressesTabButtonTarget : null,
            profile: this.hasProfileTabButtonTarget ? this.profileTabButtonTarget : null,
        };

        Object.entries(tabs).forEach(([name, button]) => {
            if (!button) {
                return;
            }

            button.classList.toggle('is-active', name === this.activeSection);
        });

        if (this.activeSection === 'explore') {
            this.refreshMapViewport();
        }
    }

    persistExploreMode() {
        try {
            window.localStorage.setItem('mm_explore_mode', this.exploreMode);
        } catch (error) {
            // Ignore storage failures.
        }
    }

    restoreExploreMode() {
        try {
            const storedMode = window.localStorage.getItem('mm_explore_mode');
            if (storedMode === 'list' || storedMode === 'map') {
                this.exploreMode = storedMode;
            }
        } catch (error) {
            this.exploreMode = 'map';
        }
    }

    persistLocationContext() {
        if (!this.hasUserCoordinates()) {
            return;
        }

        const payload = {
            lat: Number(this.latValue.toFixed(6)),
            lng: Number(this.lngValue.toFixed(6)),
            label: this.currentLocationLabel || 'Ubicación actual',
            updated_at: new Date().toISOString(),
        };

        try {
            window.localStorage.setItem('mi_monchis_location_context', JSON.stringify(payload));
        } catch (error) {
            // Ignore storage failures in demo mode.
        }

        if (window.history?.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.delete('lat');
            url.searchParams.delete('lng');
            window.history.replaceState({}, '', url.toString());
        }
    }

    restorePersistedLocationContext() {
        const hasServerCoordinates = this.hasUserCoordinates();
        let persistedContext = null;

        try {
            persistedContext = JSON.parse(window.localStorage.getItem('mi_monchis_location_context') ?? 'null');
        } catch (error) {
            persistedContext = null;
        }

        if (
            !hasServerCoordinates
            && persistedContext
            && Number.isFinite(Number(persistedContext.lat))
            && Number.isFinite(Number(persistedContext.lng))
        ) {
            this.latValue = Number(persistedContext.lat);
            this.lngValue = Number(persistedContext.lng);
        }

        if (persistedContext?.label) {
            this.currentLocationLabel = String(persistedContext.label);
            if (this.hasHeroLocationTarget) {
                this.heroLocationTarget.textContent = this.currentLocationLabel;
            }
            if (this.hasHeroLocationDesktopTarget) {
                this.heroLocationDesktopTarget.textContent = this.currentLocationLabel;
            }
            return;
        }

        if (hasServerCoordinates) {
            this.currentLocationLabel = 'Ubicación actual';
            if (this.hasHeroLocationTarget) {
                this.heroLocationTarget.textContent = this.currentLocationLabel;
            }
            if (this.hasHeroLocationDesktopTarget) {
                this.heroLocationDesktopTarget.textContent = this.currentLocationLabel;
            }
        }
    }

    async afterLayoutSettles() {
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }

    refreshMapViewport() {
        if (!this.map || !window.google?.maps) {
            return;
        }

        const center = this.map.getCenter();
        window.google.maps.event.trigger(this.map, 'resize');

        if (center) {
            this.map.setCenter(center);
        }
    }

    locationKey(location) {
        if (location.selection_key) {
            return String(location.selection_key);
        }

        if (location.location_id != null && location.location_id !== '') {
            return `core:${location.location_id}`;
        }

        if (location.place_id) {
            return `place:${location.place_id}`;
        }

        return `unknown:${location.location_name ?? 'location'}`;
    }

    distanceMeters(lat1, lng1, lat2, lng2) {
        const nLat1 = Number(lat1);
        const nLng1 = Number(lng1);
        const nLat2 = Number(lat2);
        const nLng2 = Number(lng2);

        if (!Number.isFinite(nLat1) || !Number.isFinite(nLng1) || !Number.isFinite(nLat2) || !Number.isFinite(nLng2)) {
            return null;
        }

        const earthRadius = 6371000;
        const dLat = this.degToRad(nLat2 - nLat1);
        const dLng = this.degToRad(nLng2 - nLng1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(this.degToRad(nLat1)) * Math.cos(this.degToRad(nLat2)) * Math.sin(dLng / 2) ** 2;

        return Math.round(earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
    }

    degToRad(value) {
        return value * (Math.PI / 180);
    }

    favoriteButtonMarkup(locationId) {
        const isFavorite = this.favoriteLocationIds.includes(locationId);

        return `
            <button
                type="button"
                class="mobile-map-card__heart ${isFavorite ? 'is-active' : ''}"
                data-action="map-shell#toggleFavorite"
                data-location-id="${locationId}"
                aria-label="Guardar favorito"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s-7-4.4-9.2-8.5C.9 9.1 2.3 5 6.3 5c2.2 0 3.6 1.3 4.4 2.4C11.5 6.3 12.9 5 15.1 5c4 0 5.4 4.1 3.5 7.5C16.4 16.6 12 21 12 21Z"></path>
                </svg>
            </button>
        `;
    }

    canFavorite(location) {
        return Number.isInteger(Number(location.location_id)) && location.source_type !== 'google_places';
    }

    acceptCookiesFromProfile() {
        this.storeCookieConsent('all');
        this.renderCookieConsentStatus();
        document.querySelector('[data-controller~="cookie-consent"]')?.classList.add('is-hidden');
    }

    rejectCookiesFromProfile() {
        this.storeCookieConsent('essential');
        this.renderCookieConsentStatus();
        document.querySelector('[data-controller~="cookie-consent"]')?.classList.add('is-hidden');
    }

    resetCookiesFromProfile() {
        try {
            window.localStorage.removeItem('mi_monchis_cookie_consent');
        } catch (error) {
            // No bloquear UX si storage falla.
        }

        this.renderCookieConsentStatus();
        document.querySelector('[data-controller~="cookie-consent"]')?.classList.remove('is-hidden');
    }

    renderCookieConsentStatus() {
        if (!this.hasCookieConsentStatusTarget) {
            return;
        }

        const consent = this.readCookieConsent();
        if (!consent) {
            this.cookieConsentStatusTarget.textContent = 'Sin decisión registrada en este dispositivo.';
            return;
        }

        this.cookieConsentStatusTarget.textContent = consent.scope === 'all'
            ? 'Aceptaste cookies esenciales y analítica.'
            : 'Solo cookies esenciales activas.';
    }

    storeCookieConsent(scope) {
        try {
            window.localStorage.setItem('mi_monchis_cookie_consent', JSON.stringify({
                scope,
                version: 'v1.0',
                decided_at: new Date().toISOString(),
            }));
        } catch (error) {
            // No bloquear UX si storage falla.
        }
    }

    readCookieConsent() {
        try {
            const rawConsent = window.localStorage.getItem('mi_monchis_cookie_consent');

            return rawConsent ? JSON.parse(rawConsent) : null;
        } catch (error) {
            return null;
        }
    }

    addressLine(address) {
        const parts = [];

        if (address.city) {
            parts.push(address.city);
        }
        if (address.state) {
            parts.push(address.state);
        }
        if (address.reference) {
            parts.push(address.reference);
        }
        if (address.latitude && address.longitude) {
            parts.push(`${address.latitude}, ${address.longitude}`);
        }

        return parts.length > 0 ? parts.join(' · ') : 'Sin detalles adicionales.';
    }

    normalizeOptionalCoordinate(value) {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    }

    resetAddressForm() {
        this.addressLabelInputTarget.value = '';
        this.addressCityInputTarget.value = '';
        this.addressStateInputTarget.value = '';
        this.addressReferenceInputTarget.value = '';
        this.addressPrimaryInputTarget.checked = false;
    }

    setAddressStatus(message) {
        if (this.hasAddressStatusTarget) {
            this.addressStatusTarget.textContent = message;
        }
    }

    setCanvasNote(message) {
        if (this.hasCanvasNoteTarget) {
            this.canvasNoteTarget.textContent = message;
        }
    }

    zoomIn() {
        if (!this.map) {
            return;
        }

        this.map.setZoom((this.map.getZoom() ?? 12) + 1);
    }

    zoomOut() {
        if (!this.map) {
            return;
        }

        this.map.setZoom((this.map.getZoom() ?? 12) - 1);
    }

    toggleMapType() {
        this.currentMapTypeId = this.currentMapTypeId === 'roadmap' ? 'satellite' : 'roadmap';

        if (this.map) {
            this.map.setMapTypeId(this.currentMapTypeId);
        }

        this.setStatus(this.currentMapTypeId === 'satellite' ? 'Mapa satelital activado.' : 'Mapa base activado.');
    }

    setSelectedLocation(locationKey) {
        this.selectedLocationId = locationKey;
        this.syncActiveCard();
    }

    async openLocationFromInfoWindow(event) {
        const locationKey = event.currentTarget.dataset.locationKey ?? '';
        if (locationKey === '') {
            return;
        }

        const location = this.currentLocations.find((item) => this.locationKey(item) === locationKey);
        if (!location) {
            return;
        }

        const enrichedLocation = await this.enrichLocationIfNeeded(location);
        this.renderDetailSheet(enrichedLocation);
        this.logInteraction('public_location_opened', 'location', Number(enrichedLocation.location_id) || null, {
            source_type: enrichedLocation.source_type ?? null,
            place_id: enrichedLocation.place_id ?? null,
            via: 'info_window',
        });
    }

    syncActiveCard() {
        this.element.querySelectorAll('[data-card-location-key]').forEach((element) => {
            const locationKey = element.dataset.cardLocationKey ?? '';
            element.classList.toggle('is-active', locationKey !== '' && locationKey === this.selectedLocationId);
        });

        const escapedKey = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(String(this.selectedLocationId ?? ''))
            : String(this.selectedLocationId ?? '');
        const activeCard = this.element.querySelector(`[data-card-location-key="${escapedKey}"]`);
        if (activeCard) {
            activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }

    cardSubtitle(location) {
        if (location.source_type === 'google_places') {
            return location.short_address || 'Dirección pendiente';
        }

        if (location.merchant_name) {
            if (location.short_address && location.short_address !== location.merchant_name) {
                return `${location.merchant_name} • ${location.short_address}`;
            }

            return location.merchant_name;
        }

        if (location.short_address) {
            return location.short_address;
        }

        return 'Direccion pendiente';
    }

    formatDistance(distanceMeters) {
        if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
            return '';
        }

        if (distanceMeters >= 1000) {
            return `${(distanceMeters / 1000).toFixed(1)} km`;
        }

        return `${distanceMeters} m`;
    }

    mediaTone(location) {
        const key = this.locationKey(location);
        let hash = 0;
        for (let index = 0; index < key.length; index += 1) {
            hash = (hash + key.charCodeAt(index)) % 4;
        }

        return hash + 1;
    }

    mediaStyle(location) {
        const photoUrl = this.locationVisualPhotoUrl(location);
        if (!photoUrl) {
            return '';
        }

        return `style="background-image:url('${this.escapeHtml(photoUrl)}')"`;
    }

    async enrichLocationIfNeeded(location) {
        if (location.source_type !== 'google_places' || !location.place_id) {
            return location;
        }

        const cachedDetails = this.placeDetailsCache.get(location.place_id);
        if (cachedDetails) {
            return this.applyLocationPatch(location, cachedDetails);
        }

        try {
            const details = await this.fetchGooglePlaceEnrichment(location.place_id);
            this.placeDetailsCache.set(location.place_id, details);
            return this.applyLocationPatch(location, details, { rerenderVisible: true });
        } catch (error) {
            return location;
        }
    }

    applyLocationPatch(location, patch, options = {}) {
        const locationKey = this.locationKey(location);
        const nextLocation = {
            ...location,
            ...patch,
        };

        if (Number.isFinite(nextLocation.lat) && Number.isFinite(nextLocation.lng) && this.hasUserCoordinates()) {
            nextLocation.distance_meters = this.distanceMeters(
                this.latValue,
                this.lngValue,
                Number(nextLocation.lat),
                Number(nextLocation.lng),
            );
        }

        this.currentLocations = this.currentLocations.map((candidate) => (
            this.locationKey(candidate) === locationKey
                ? { ...candidate, ...nextLocation }
                : candidate
        ));
        this.visibleLocations = this.filteredLocations(this.currentLocations);

        if (options.rerenderVisible) {
            this.renderCategoryChips(this.currentLocations);
            this.updateCounts(this.visibleLocations.length);
            this.renderList(this.visibleLocations);
            this.syncFavoriteButtons();
            this.syncActiveCard();
            this.refreshDetailSheet();
        }

        return nextLocation;
    }

    reviewsLabel(location) {
        const rating = typeof location.rating === 'number' ? location.rating : null;
        const total = Number.isInteger(location.user_ratings_total) ? location.user_ratings_total : null;

        if (rating != null && total != null && total > 0) {
            return `${rating.toFixed(1)} (${total})`;
        }

        if (rating != null) {
            return `${rating.toFixed(1)} estrellas`;
        }

        return 'Sin reseñas';
    }

    locationIsOpen(location) {
        if (typeof location.open_now === 'boolean') {
            return location.open_now;
        }

        return null;
    }

    openingHoursSummary(location) {
        if (!Array.isArray(location.opening_hours_text) || location.opening_hours_text.length === 0) {
            return '';
        }

        return location.opening_hours_text[0] ?? '';
    }

    reviewSnippet(location) {
        if (!Array.isArray(location.google_reviews) || location.google_reviews.length === 0) {
            return '';
        }

        const firstReview = location.google_reviews.find((review) => review.text && review.text.trim() !== '');
        if (!firstReview) {
            return '';
        }

        const author = firstReview.author_name ? `${firstReview.author_name}: ` : '';
        const snippet = firstReview.text.trim();
        return `${author}${snippet.length > 110 ? `${snippet.slice(0, 107)}...` : snippet}`;
    }

    locationVisualPhotoUrl(location) {
        return location.photo_url
            || location.category_cover_photo_url
            || location.category_default_photo_url
            || null;
    }

    escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    normalizeComparisonText(value) {
        return String(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    async requestJson(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                ...(options.headers ?? {}),
            },
            ...options,
        });

        const payload = await response.json();
        if (!response.ok || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
            throw new Error(payload.errors?.[0] ?? 'La operación no se pudo completar.');
        }

        return payload;
    }

    renderDetailSheet(location) {
        if (!this.hasDetailSheetTarget || !this.hasDetailSheetBodyTarget || !location) {
            return;
        }

        const canFavorite = this.canFavorite(location);
        const categoryKey = this.locationCategoryKey(location);
        const categoryLabel = categoryKey !== 'all' ? this.categoryDisplayName(categoryKey) : '';
        const categoryColor = categoryKey !== 'all' ? this.categoryColor(categoryKey) : '#E5E7EB';
        const directionsUrl = this.buildDirectionsUrl(location);
        const whatsappUrl = this.buildWhatsAppUrl(location.whatsapp_enabled, location.whatsapp_e164);
        const claimUrl = this.buildClaimUrl(location);
        const isFavorite = Number.isInteger(Number(location.location_id)) && this.favoriteLocationIds.includes(Number(location.location_id));
        const ratingLabel = this.reviewsLabel(location);
        const hoursSummary = this.openingHoursSummary(location);
        const reviewSnippet = this.reviewSnippet(location);
        const detailKey = this.escapeHtml(this.locationKey(location));

        this.detailSheetBodyTarget.innerHTML = `
            <div class="mobile-map-app__detail-hero ${this.locationVisualPhotoUrl(location) ? 'has-photo' : ''}" ${this.mediaStyle(location)}>
                <span class="mobile-map-app__detail-source ${this.sourceBadgeClass(location)}">${this.escapeHtml(this.sourceTypeLabel(location.source_type))}</span>
                <div class="mobile-map-app__detail-distance">${this.escapeHtml(this.formatDistance(location.distance_meters))}</div>
            </div>
            <div class="mobile-map-app__detail-copy">
                <div class="mobile-map-app__detail-head">
                    <div>
                        <h3>${this.escapeHtml(location.location_name ?? 'Local sin nombre')}</h3>
                        <p>${this.escapeHtml(this.cardSubtitle(location))}</p>
                    </div>
                    <span class="mobile-map-app__detail-status ${this.publicationStatusClass(location)}">${this.escapeHtml(this.publicationStatusLabel(location))}</span>
                </div>
                ${categoryLabel ? `<div class="mobile-map-app__detail-category"><span style="background:${this.escapeHtml(categoryColor)};"></span>${this.escapeHtml(categoryLabel)}</div>` : ''}
                <div class="mobile-map-app__detail-meta">
                    <span>${this.escapeHtml(ratingLabel)}</span>
                    <span>${this.escapeHtml(location.short_address ?? 'Dirección pendiente')}</span>
                </div>
                ${this.locationIsJoyita(location) ? `<div class="mobile-map-app__detail-joyita">${this.escapeHtml(this.joyitaDetailLabel(location))}</div>` : ''}
                ${hoursSummary ? `<p class="mobile-map-app__detail-note">${this.escapeHtml(hoursSummary)}</p>` : ''}
                ${reviewSnippet ? `<blockquote class="mobile-map-app__detail-review">${this.escapeHtml(reviewSnippet)}</blockquote>` : ''}
                <div class="mobile-map-app__detail-actions">
                    ${directionsUrl ? `<a href="${this.escapeHtml(directionsUrl)}" target="_blank" rel="noreferrer" data-action="click->map-shell#trackExternalAction" data-event-name="public_directions_clicked" data-entity-id="${this.escapeHtml(String(location.location_id ?? ''))}" data-location-key="${detailKey}">Cómo llegar</a>` : ''}
                    ${whatsappUrl ? `<a href="${this.escapeHtml(whatsappUrl)}" target="_blank" rel="noreferrer" data-action="click->map-shell#trackExternalAction" data-event-name="public_whatsapp_clicked" data-entity-id="${this.escapeHtml(String(location.location_id ?? ''))}" data-location-key="${detailKey}">WhatsApp</a>` : ''}
                    ${claimUrl ? `<a href="${this.escapeHtml(claimUrl)}" data-action="click->map-shell#trackExternalAction" data-event-name="public_claim_started" data-entity-id="${this.escapeHtml(String(location.location_id ?? ''))}" data-location-key="${detailKey}">Reclamar</a>` : ''}
                    ${canFavorite ? `<button type="button" class="${isFavorite ? 'is-active' : ''}" data-action="click->map-shell#toggleFavoriteFromSheet" data-location-id="${this.escapeHtml(String(location.location_id))}">${isFavorite ? 'Quitar favorito' : 'Guardar favorito'}</button>` : ''}
                </div>
                ${!canFavorite && location.source_type === 'google_places' ? '<p class="mobile-map-app__detail-policy">Los lugares de Google se pueden reclamar antes de guardarse como favorito en Mi Monchis.</p>' : ''}
            </div>
        `;

        this.detailSheetTarget.classList.remove('is-hidden');
        this.detailSheetTarget.classList.add('is-visible');
    }

    refreshDetailSheet() {
        if (!this.hasDetailSheetTarget || this.detailSheetTarget.classList.contains('is-hidden') || !this.selectedLocationId) {
            return;
        }

        const location = this.currentLocations.find((item) => this.locationKey(item) === this.selectedLocationId);
        if (!location) {
            this.closeDetailSheet();
            return;
        }

        this.renderDetailSheet(location);
    }

    closeDetailSheet() {
        if (!this.hasDetailSheetTarget) {
            return;
        }

        this.detailSheetTarget.classList.remove('is-visible');
        this.detailSheetTarget.classList.add('is-hidden');
    }

    async toggleFavoriteFromSheet(event) {
        await this.toggleFavorite(event);
        this.refreshDetailSheet();
    }

    joyitaDetailLabel(location) {
        const tags = Array.isArray(location.gem_reason_tags) && location.gem_reason_tags.length > 0
            ? `: ${location.gem_reason_tags.slice(0, 3).join(' · ')}`
            : '';

        return `Joyita editorial${tags}`;
    }

    trackExternalAction(event) {
        const entityIdRaw = event.currentTarget.dataset.entityId ?? '';
        const locationKey = event.currentTarget.dataset.locationKey ?? '';
        const location = this.currentLocations.find((item) => this.locationKey(item) === locationKey) ?? null;

        this.logInteraction(
            event.currentTarget.dataset.eventName ?? 'public_link_clicked',
            'location',
            entityIdRaw !== '' ? Number(entityIdRaw) : null,
            {
                source_type: location?.source_type ?? null,
                place_id: location?.place_id ?? null,
                location_name: location?.location_name ?? null,
            },
        );
    }

    async logInteraction(eventName, entityType, entityId = null, metadata = {}) {
        if (!this.hasEventLogUrlValue || !this.eventLogUrlValue) {
            return;
        }

        if (!this.analyticsConsentGranted()) {
            return;
        }

        try {
            await fetch(this.eventLogUrlValue, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    event_name: eventName,
                    entity_type: entityType,
                    entity_id: entityId,
                    metadata,
                }),
            });
        } catch (error) {
            // No bloquear UX por fallas de analítica.
        }
    }

    analyticsConsentGranted() {
        return this.readCookieConsent()?.scope === 'all';
    }
}
