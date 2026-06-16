import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = [
        'canvas',
        'status',
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
        'menuButton',
        'menuPanel',
        'desktopSearchInput',
        'mobileSearchInput',
        'authModal',
        'authModalTitle',
        'authModalCopy',
        'authPasswordInput',
        'heroLocation',
        'sourceFilterRow',
        'menuSourceFilterRow',
        'menuCategoryList',
        'sortFilterRow',
        'menuSortFilterRow',
        'chipRow',
        'categoryChip',
        'notificationsButton',
        'notificationsPanel',
        'switcherToggle',
        'locationSwitcher',
        'serviceFilterLabel',
        'notificationsBadge',
        'favoritesCount',
        'favoritesCountDuplicate',
        'favoritesList',
        'addressesCount',
        'addressesCountDuplicate',
        'addressesList',
        'profileStatus',
        'profileLegalList',
        'addressLabelInput',
        'addressCityInput',
        'addressStateInput',
        'addressReferenceInput',
        'addressLatInput',
        'addressLngInput',
        'addressPrimaryInput',
        'addressStatus',
        'canvasNote',
        'routePanel',
        'routeStatus',
        'routeMeta',
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
        meUrl: String,
        favoritesUrl: String,
        addressesUrl: String,
        reviewsUrl: String,
        googleMapsApiKey: String,
        claimUrl: String,
        eventLogUrl: String,
        walkthroughEnabled: Boolean,
        logoUrl: String,
        authenticated: Boolean,
        initialFavorites: Array,
        initialAddresses: Array,
        initialLocationLabel: String,
        lat: Number,
        lng: Number,
    };

    connect() {
        this.latValue = this.hasLatValue ? Number(this.latValue) : Number.NaN;
        this.lngValue = this.hasLngValue ? Number(this.lngValue) : Number.NaN;
        this.favoriteItems = this.normalizeInitialFavorites(this.initialFavoritesValue);
        this.favoriteLocationIds = this.favoriteItems
            .map((favorite) => Number.parseInt(String(favorite.location_id ?? ''), 10))
            .filter((locationId) => Number.isInteger(locationId));
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
        this.mapSettings = {
            defaultZoom: 18,
            focusedZoom: 18,
            streetLabelWeight: 'normal',
        };
        this.googlePlacesSettings = {
            include_photos: true,
            include_ratings: true,
            include_opening_hours: true,
            include_service_attributes: true,
        };
        this.selectedLocationId = null;
        this.activeCategoryFilter = 'all';
        this.joyitasOnly = false;
        this.activeSourceFilter = 'all';
        this.activeServiceFilter = 'all';
        this.activeSortFilter = 'distance';
        this.activeSearchQuery = '';
        this.map = null;
        this.markers = [];
        this.infoWindow = null;
        this.directionsService = null;
        this.directionsRenderer = null;
        this.activeRouteKey = null;
        this.activeRouteLocationName = null;
        this.routeState = 'idle';
        this.googleMapsReady = false;
        this.currentMapTypeId = 'roadmap';
        this.walkthroughTypingTimer = null;
        this.walkthroughHideTimer = null;
        this.mapIdleTimer = null;
        this.searchFilterTimer = null;
        this.walkthroughPredictions = [];
        this.walkthroughSelection = null;
        this.userMarker = null;
        this.notificationsOpen = false;
        this.notificationsStorageKey = 'mi_monchis_public_notifications_read_v1';
        this.notificationsUnreadCount = this.readNotificationsState() ? 0 : 1;
        this.menuOpen = false;
        this.locationSwitcherOpen = false;
        this.locationSwitcherMode = 'locations';
        this.exploreMode = 'map';
        this.activeSection = 'explore';
        this.placeDetailsCache = new Map();
        this.profilePayload = null;
        this.lastDiscoveryCenter = null;
        this.isDiscoveringPlaces = false;
        this.isSyncingMapViewport = false;
        this.pendingViewportCenter = this.hasUserCoordinates() ? this.currentUserPosition() : null;
        this.currentLocationLabel = this.hasHeroLocationTarget ? this.heroLocationTarget.textContent.trim() : '';
        this.restoreReturnSheetContext();
        if (this.currentLocationLabel) {
            this.updateHeroLocation(this.currentLocationLabel, { persist: false });
        }
        this.restoreExploreMode();
        this.restorePersistedLocationContext();
        this.renderFavoritesSummary();
        this.renderAddressesSummary();
        this.renderServiceFilterSummary();
        this.renderNotificationsState();
        this.renderCookieConsentStatus();
        this.refreshProfileSummary();
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
        if (this.searchFilterTimer) {
            window.clearTimeout(this.searchFilterTimer);
        }
    }

    restoreReturnSheetContext() {
        const params = new URLSearchParams(window.location.search);
        const sheetLocation = params.get('sheet_location');
        if (!sheetLocation) {
            this.pendingReturnSheetLocationKey = null;
            return;
        }

        this.pendingReturnSheetLocationKey = sheetLocation;
        this.selectedLocationId = sheetLocation;

        if (params.has('lat') && params.has('lng')) {
            const lat = Number(params.get('lat'));
            const lng = Number(params.get('lng'));
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                this.applyCoordinates(lat, lng);
            }
        }
    }

    clearReturnSheetContextFromUrl() {
        if (!window.history?.replaceState) {
            return;
        }

        const url = new URL(window.location.href);
        if (!url.searchParams.has('sheet_location')) {
            return;
        }

        url.searchParams.delete('sheet_location');
        window.history.replaceState({}, '', url.toString());
    }

    async detectLocation() {
        try {
            this.setStatus('Solicitando geolocalización...');
            const coords = await this.requestGeolocation();
            this.applyCoordinates(coords.latitude, coords.longitude);
            this.updateHeroLocation('Ubicación actual', { persist: !this.authenticatedValue });
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
        if (this.notificationsOpen) {
            this.menuOpen = false;
            this.renderMenuState();
            this.markNotificationsAsRead();
        }
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

    readNotificationsState() {
        try {
            return window.localStorage.getItem(this.notificationsStorageKey) === 'read';
        } catch (error) {
            return false;
        }
    }

    markNotificationsAsRead() {
        this.notificationsUnreadCount = 0;
        try {
            window.localStorage.setItem(this.notificationsStorageKey, 'read');
        } catch (error) {
            // No bloquear la experiencia si storage no esta disponible.
        }
    }

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        if (this.menuOpen) {
            this.notificationsOpen = false;
            this.locationSwitcherOpen = false;
            this.renderNotificationsState();
            this.renderLocationSwitcherState();
        }
        this.renderMenuState();
    }

    closeMenu() {
        this.menuOpen = false;
        this.renderMenuState();
    }

    closeMenuOnEscape(event) {
        if (event.key === 'Escape') {
            this.closeMenu();
        }
    }

    toggleLocationSwitcher(event) {
        const requestedMode = event?.currentTarget?.dataset?.switcherMode ?? 'locations';
        if (requestedMode === 'locations' && !this.requireAuthentication({
            title: 'Guarda tus ubis en Mi Monchis',
            copy: 'Inicia sesión para ver, guardar y reutilizar tus direcciones desde cualquier dispositivo.',
            status: 'Inicia sesión para administrar Mis ubis.',
        })) {
            return;
        }

        if (this.locationSwitcherOpen && this.locationSwitcherMode === requestedMode) {
            this.locationSwitcherOpen = false;
        } else {
            this.locationSwitcherMode = requestedMode;
            this.locationSwitcherOpen = true;
        }
        this.renderLocationSwitcherState();
    }

    showExploreSection() {
        this.activeSection = 'explore';
        this.renderActiveSection();
        this.logInteraction('public_section_changed', 'ui_section', null, { section: 'explore' });
    }

    showFavoritesSection() {
        if (!this.requireAuthentication({
            title: 'Tus favoritos viven en tu cuenta',
            copy: 'Inicia sesión para guardar locales, recuperarlos después y armar tu colección de antojos.',
            status: 'Inicia sesión para ver tus favoritos.',
        })) {
            return;
        }

        this.activeSection = 'favorites';
        this.renderActiveSection();
        this.logInteraction('public_section_changed', 'ui_section', null, { section: 'favorites' });
    }

    showAddressesSection() {
        if (!this.requireAuthentication({
            title: 'Guarda tus ubis en Mi Monchis',
            copy: 'Inicia sesión para crear direcciones, elegir tu ubi principal y explorar más rápido.',
            status: 'Inicia sesión para guardar Mis ubis.',
        })) {
            return;
        }

        this.activeSection = 'addresses';
        this.renderActiveSection();
        this.logInteraction('public_section_changed', 'ui_section', null, { section: 'addresses' });
    }

    showProfileSection() {
        if (!this.requireAuthentication({
            title: 'Tu perfil se activa al iniciar sesión',
            copy: 'Entra a tu cuenta para consultar favoritos, ubis guardadas y preferencias de Mi Monchis.',
            status: 'Inicia sesión para ver tu perfil.',
        })) {
            return;
        }

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
        if (!this.locationSwitcherOpen || !this.hasLocationSwitcherTarget) {
            return;
        }

        const clickedInsidePanel = this.locationSwitcherTarget.contains(event.target);
        const clickedButton = this.hasSwitcherToggleTarget
            ? this.switcherToggleTargets.some((button) => button.contains(event.target))
            : false;
        if (!clickedInsidePanel && !clickedButton) {
            this.locationSwitcherOpen = false;
            this.renderLocationSwitcherState();
        }
    }

    closeAuthModalOnEscape(event) {
        if (event.key === 'Escape') {
            this.closeAuthModal();
        }
    }

    async selectSavedAddress(event) {
        const { lat, lng, label } = event.currentTarget.dataset;
        this.applyCoordinates(Number(lat), Number(lng));
        this.updateHeroLocation(label);
        this.setStatus(`Explorando cerca de ${label}.`);
        await this.loadFeed();
        this.activeSection = 'explore';
        this.renderActiveSection();
        this.locationSwitcherOpen = false;
        this.renderLocationSwitcherState();
        this.logInteraction('public_saved_address_selected', 'user_address', Number(event.currentTarget.dataset.addressId ?? 0) || null, {
            label,
        });
    }

    async selectServiceFilter(event) {
        const nextFilter = event.currentTarget.dataset.serviceFilter ?? 'all';
        this.activeServiceFilter = nextFilter;
        this.locationSwitcherOpen = false;
        this.renderLocationSwitcherState();
        this.renderServiceFilterSummary();
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
        this.refreshDetailSheet();

        this.logInteraction('public_service_filter_changed', 'ui_filter', null, { service_filter: nextFilter });
    }

    filterByDesktopSearch(event) {
        const input = event?.currentTarget ?? (this.hasDesktopSearchInputTarget ? this.desktopSearchInputTarget : null);
        if (!input) {
            return;
        }

        this.activeSearchQuery = input.value.trim();
        if (this.searchFilterTimer) {
            window.clearTimeout(this.searchFilterTimer);
        }

        this.searchFilterTimer = window.setTimeout(() => {
            this.applyVisibleFilters('No encontré locales para esa búsqueda.');
        }, 180);
    }

    async submitDesktopSearch(event) {
        event.preventDefault();
        if (this.searchFilterTimer) {
            window.clearTimeout(this.searchFilterTimer);
        }
        const input = event.currentTarget.querySelector('input[type="search"]')
            ?? (this.hasDesktopSearchInputTarget ? this.desktopSearchInputTarget : null)
            ?? (this.hasMobileSearchInputTarget ? this.mobileSearchInputTarget : null);
        if (input) {
            this.activeSearchQuery = input.value.trim();
        }
        await this.applyVisibleFilters('No encontré locales para esa búsqueda.');
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
        if (!this.requireAuthentication({
                title: 'Mi Monchis',
                copy: 'Inicia sesión para guardar tus antojos favoritos y volver a ellos cuando quieras.',
                status: 'Inicia sesión para guardar favoritos.',
            })) {
            return;
        }

        const button = event.currentTarget;
        const favoriteKey = button.dataset.favoriteKey ?? '';
        const locationKey = button.dataset.locationKey ?? '';
        const location = this.currentLocations.find((item) => this.favoriteKeyForLocation(item) === favoriteKey)
            ?? this.currentLocations.find((item) => this.locationKey(item) === locationKey)
            ?? null;

        if (!favoriteKey || !location) {
            this.setStatus('No se pudo identificar el local.');
            return;
        }

        button.disabled = true;

        try {
            if (this.isLocationFavorite(location)) {
                await this.requestJson(`${this.favoritesUrlValue}/${encodeURIComponent(favoriteKey)}`, { method: 'DELETE' });
                this.removeFavoriteItem(favoriteKey);
                this.setStatus(`${location.location_name ?? 'Local'} eliminado de favoritos.`);
                this.logInteraction('public_favorite_removed', 'location', Number(location.location_id) || null, {
                    favorite_key: favoriteKey,
                    source_type: location.source_type ?? null,
                });
            } else {
                const payload = this.favoritePayloadForLocation(location);
                const response = await this.requestJson(this.favoritesUrlValue, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                this.upsertFavoriteItem(response.data ?? payload);
                this.setStatus(`${location.location_name ?? 'Local'} guardado en favoritos.`);
                this.logInteraction('public_favorite_added', 'location', Number(location.location_id) || null, {
                    favorite_key: favoriteKey,
                    source_type: location.source_type ?? null,
                });
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

        const favoriteKey = event.currentTarget.dataset.favoriteKey ?? '';
        if (favoriteKey === '') {
            return;
        }

        try {
            await this.requestJson(`${this.favoritesUrlValue}/${encodeURIComponent(favoriteKey)}`, { method: 'DELETE' });
            this.removeFavoriteItem(favoriteKey);
            this.renderFavoritesSummary();
            this.syncFavoriteButtons();
            this.setStatus('Favorito eliminado.');
            this.refreshDetailSheet();
            this.logInteraction('public_favorite_removed', 'location', null, { favorite_key: favoriteKey });
        } catch (error) {
            this.setStatus(error.message);
        }
    }

    openAuthModal(options = {}) {
        if (!this.hasAuthModalTarget) {
            return;
        }

        if (this.hasAuthModalTitleTarget && options.title) {
            this.authModalTitleTarget.textContent = options.title;
        }

        if (this.hasAuthModalCopyTarget && options.copy) {
            this.authModalCopyTarget.textContent = options.copy;
        }

        this.authModalTarget.classList.remove('is-hidden');
        this.authModalTarget.classList.add('is-visible');
        document.documentElement.classList.add('has-auth-modal-open');

        const firstInput = this.authModalTarget.querySelector('input[name="_username"]');
        window.setTimeout(() => {
            firstInput?.focus({ preventScroll: true });
        }, 260);
    }

    requireAuthentication(options = {}) {
        if (this.authenticatedValue) {
            return true;
        }

        this.locationSwitcherOpen = false;
        this.renderLocationSwitcherState();
        this.openAuthModal(options);

        if (options.status) {
            this.setStatus(options.status);
        }

        return false;
    }

    closeAuthModal() {
        if (!this.hasAuthModalTarget) {
            return;
        }

        this.authModalTarget.classList.remove('is-visible');
        this.authModalTarget.classList.add('is-hidden');
        document.documentElement.classList.remove('has-auth-modal-open');
    }

    normalizeInitialFavorites(rawFavorites) {
        if (!Array.isArray(rawFavorites)) {
            return [];
        }

        return rawFavorites
            .map((favorite) => {
                if (typeof favorite === 'number' || typeof favorite === 'string') {
                    const locationId = Number.parseInt(String(favorite), 10);
                    if (!Number.isInteger(locationId)) {
                        return null;
                    }

                    return {
                        favorite_key: this.favoriteKeyForSource('canonical', String(locationId)),
                        source_type: 'canonical',
                        location_id: locationId,
                        external_source_key: null,
                        snapshot: {},
                    };
                }

                if (!favorite || typeof favorite !== 'object') {
                    return null;
                }

                const locationId = Number.parseInt(String(favorite.location_id ?? ''), 10);
                const sourceType = this.normalizeFavoriteSource(favorite.source_type ?? (Number.isInteger(locationId) ? 'canonical' : 'google_places'));
                const externalSourceKey = favorite.external_source_key ? String(favorite.external_source_key) : null;
                const identity = sourceType === 'canonical' ? String(locationId) : (externalSourceKey ?? '');
                if (identity === '' || (sourceType === 'canonical' && !Number.isInteger(locationId))) {
                    return null;
                }

                return {
                    favorite_key: String(favorite.favorite_key ?? this.favoriteKeyForSource(sourceType, identity)),
                    source_type: sourceType,
                    location_id: Number.isInteger(locationId) ? locationId : null,
                    external_source_key: externalSourceKey,
                    snapshot: favorite.snapshot && typeof favorite.snapshot === 'object' ? favorite.snapshot : {},
                    created_at: favorite.created_at ?? null,
                };
            })
            .filter(Boolean);
    }

    favoriteKeyForSource(sourceType, identity) {
        return `${this.normalizeFavoriteSource(sourceType)}:${String(identity).trim()}`;
    }

    normalizeFavoriteSource(sourceType) {
        const normalized = String(sourceType ?? '').toLowerCase();
        return ['google_places', 'google', 'places'].includes(normalized) ? 'google_places' : 'canonical';
    }

    favoriteKeyForLocation(location) {
        const sourceType = this.normalizeFavoriteSource(location.source_type);
        if (sourceType === 'google_places') {
            const externalKey = location.external_source_key ?? location.place_id ?? '';
            return externalKey ? this.favoriteKeyForSource(sourceType, externalKey) : '';
        }

        const locationId = Number.parseInt(String(location.location_id ?? ''), 10);
        return Number.isInteger(locationId) ? this.favoriteKeyForSource('canonical', String(locationId)) : '';
    }

    isLocationFavorite(location) {
        const favoriteKey = this.favoriteKeyForLocation(location);
        return favoriteKey !== '' && this.favoriteItems.some((favorite) => favorite.favorite_key === favoriteKey);
    }

    upsertFavoriteItem(favorite) {
        const normalized = this.normalizeInitialFavorites([favorite])[0] ?? null;
        if (!normalized) {
            return;
        }

        this.favoriteItems = [
            normalized,
            ...this.favoriteItems.filter((item) => item.favorite_key !== normalized.favorite_key),
        ];
        this.refreshFavoriteLocationIds();
    }

    removeFavoriteItem(favoriteKey) {
        this.favoriteItems = this.favoriteItems.filter((item) => item.favorite_key !== favoriteKey);
        this.refreshFavoriteLocationIds();
    }

    refreshFavoriteLocationIds() {
        this.favoriteLocationIds = this.favoriteItems
            .map((item) => Number.parseInt(String(item.location_id ?? ''), 10))
            .filter((locationId) => Number.isInteger(locationId));
    }

    favoritePayloadForLocation(location) {
        const sourceType = this.normalizeFavoriteSource(location.source_type);
        const locationId = Number.parseInt(String(location.location_id ?? ''), 10);
        const externalSourceKey = location.external_source_key ?? location.place_id ?? null;
        const categoryKey = this.locationCategoryKey(location);

        return {
            source_type: sourceType,
            location_id: sourceType === 'canonical' && Number.isInteger(locationId) ? locationId : null,
            external_source_key: sourceType === 'google_places' ? externalSourceKey : null,
            snapshot: {
                name: location.location_name ?? location.merchant_name ?? null,
                address: location.short_address ?? null,
                photo_url: this.locationVisualPhotoUrl(location),
                category_slug: categoryKey !== 'all' ? categoryKey : null,
                category_name: categoryKey !== 'all' ? this.categoryDisplayName(categoryKey) : null,
                lat: location.lat ?? null,
                lng: location.lng ?? null,
            },
        };
    }

    toggleAuthPasswordVisibility(event) {
        if (!this.hasAuthPasswordInputTarget) {
            return;
        }

        const nextType = this.authPasswordInputTarget.type === 'password' ? 'text' : 'password';
        this.authPasswordInputTarget.type = nextType;
        event.currentTarget.setAttribute('aria-label', nextType === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    }

    async saveAddress(event) {
        event.preventDefault();

        if (!this.requireAuthentication({
                title: 'Mi Monchis',
                copy: 'Inicia sesión para guardar direcciones y recuperar tus zonas favoritas.',
                status: 'Inicia sesión para guardar direcciones.',
            })) {
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
            this.refreshProfileSummary();
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
            this.refreshProfileSummary();
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
        this.renderListSkeleton();
        this.setCanvasNote('Cargando mapa y locales...');

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
            this.registerMapSettings(payload.meta?.settings?.map ?? {});
            this.registerGooglePlacesSettings(payload.meta?.settings?.google_places_proxy ?? {});
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
            await this.openPendingReturnSheetIfNeeded();

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
        const triggeredFromMenu = event.currentTarget.closest('.mobile-map-app__menu') !== null;
        if (nextFilter === '__joyitas') {
            this.joyitasOnly = !this.joyitasOnly;
        } else if (nextFilter.startsWith('__source:')) {
            this.activeSourceFilter = nextFilter.replace('__source:', '') || 'all';
        } else {
            this.activeCategoryFilter = nextFilter;
        }
        this.renderCategoryChips(this.currentLocations);
        if (triggeredFromMenu) {
            this.closeMenu();
        }

        await this.applyVisibleFilters('No encontré locales para esa categoría.');
    }

    async applyVisibleFilters(emptyMessage = 'No encontré locales con esos filtros.') {
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
        this.refreshDetailSheet();

        if (this.visibleLocations.length === 0) {
            this.setStatus(emptyMessage);
        }
    }

    async openPendingReturnSheetIfNeeded() {
        if (!this.pendingReturnSheetLocationKey) {
            return;
        }

        const locationKey = this.pendingReturnSheetLocationKey;
        this.pendingReturnSheetLocationKey = null;
        const location = this.currentLocations.find((item) => this.locationKey(item) === locationKey)
            ?? this.visibleLocations.find((item) => this.locationKey(item) === locationKey);

        if (!location) {
            this.clearReturnSheetContextFromUrl();
            return;
        }

        this.selectedLocationId = this.locationKey(location);
        this.renderList(this.visibleLocations);
        await this.renderCanvas(this.visibleLocations);
        this.syncActiveCard();
        this.renderDetailSheet(await this.enrichLocationIfNeeded(location));
        this.clearReturnSheetContextFromUrl();
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
                    ${this.canFavorite(location) ? this.favoriteButtonMarkup(location) : ''}
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
                    <div class="mobile-map-card__meta mobile-map-card__meta--stacked">
                        <span class="mobile-map-card__status ${this.publicationStatusClass(location)}">${this.escapeHtml(this.publicationStatusLabel(location))}</span>
                        ${this.categoryTagMarkup(location)}
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
                : this.exploreVisualMarkup(locations, markup);
        }
    }

    exploreVisualMarkup(locations, cardsMarkup) {
        const nearbyLocations = locations.slice(0, 6);
        const categoryContextLocations = this.categoryCardContextLocations(this.currentLocations);
        const placesStoryItems = this.placesStoryItems(locations);

        return `
            ${placesStoryItems.length > 0 ? `
            <section class="mobile-map-app__visual-section">
                <div class="mobile-map-app__visual-head">
                    <h3>Historias cerca</h3>
                    <button type="button" data-category-filter="__source:google" data-action="map-shell#applyCategoryFilter">Ver Places</button>
                </div>
                <div class="mobile-map-app__places-story-row">
                    ${this.placesStoriesMarkup(placesStoryItems)}
                </div>
            </section>
            ` : ''}

            <section class="mobile-map-app__visual-section">
                <div class="mobile-map-app__visual-head">
                    <h3>Nearby Live</h3>
                    <button type="button" data-action="map-shell#setMapMode">Ver mapa</button>
                </div>
                <div class="mobile-map-app__nearby-live-row">
                    ${nearbyLocations.map((location) => `
                        <button
                            type="button"
                            class="mobile-map-app__nearby-live-card mobile-map-card__media--${this.mediaTone(location)} ${this.locationVisualPhotoUrl(location) ? 'has-photo' : ''}"
                            ${this.mediaStyle(location)}
                            data-action="click->map-shell#openVisualLocation"
                            data-location-key="${this.escapeHtml(this.locationKey(location))}"
                        >
                            <span>${this.escapeHtml(this.locationAvatarLabel(location))}</span>
                            <strong>${this.escapeHtml(this.shortLocationName(location))}</strong>
                            <small>★ ${this.escapeHtml(this.locationRating(location))}</small>
                        </button>
                    `).join('')}
                </div>
            </section>

            <section class="mobile-map-app__visual-section">
                <div class="mobile-map-app__visual-head">
                    <h3>Categorías cercanas</h3>
                    <button type="button" data-category-filter="all" data-action="map-shell#applyCategoryFilter">Ver todo</button>
                </div>
                <div class="mobile-map-app__nearby-category-grid">
                    ${this.nearbyCategoryCardsMarkup(categoryContextLocations)}
                </div>
            </section>

            <section class="mobile-map-app__visual-section">
                <div class="mobile-map-app__visual-head">
                    <h3>Qué hay cerca de ti</h3>
                    <button type="button" data-action="map-shell#setMapMode">Ver todo</button>
                </div>
                <div class="mobile-map-app__visual-card-grid">
                    ${cardsMarkup}
                </div>
            </section>

            <section class="mobile-map-app__visual-section">
                <div class="mobile-map-app__visual-head">
                    <h3>Reseñas de la comunidad</h3>
                    <button type="button">Ver todo</button>
                </div>
                <div class="mobile-map-app__review-teaser-row">
                    ${this.communityReviewTeasersMarkup(locations)}
                </div>
            </section>
        `;
    }

    placesStoryItems(locations) {
        if (!this.googlePlacesStoriesEnabled()) {
            return [];
        }

        return locations
            .filter((location) => location.source_type === 'google_places' && location.photo_url)
            .slice(0, 10)
            .map((location) => ({
                id: location.external_source_key ?? location.place_id ?? this.locationKey(location),
                locationKey: this.locationKey(location),
                title: location.location_name ?? location.merchant_name ?? 'Place cercano',
                photoUrl: location.photo_url,
                categoryLabel: this.locationCategoryKey(location) !== 'all'
                    ? this.categoryDisplayName(this.locationCategoryKey(location))
                    : 'Place',
                ratingLabel: this.placesStoryRatingLabel(location),
                distanceLabel: this.formatDistance(location.distance_meters) || 'Cerca',
            }));
    }

    placesStoriesMarkup(items) {
        return items.map((item) => `
            <button
                type="button"
                class="mobile-map-app__places-story"
                style="background-image:linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.68)), url('${this.escapeHtml(item.photoUrl)}');"
                data-action="click->map-shell#openVisualLocation"
                data-location-key="${this.escapeHtml(item.locationKey)}"
            >
                <span>${this.escapeHtml(item.categoryLabel)}</span>
                <strong>${this.escapeHtml(this.shortLocationName({ location_name: item.title }))}</strong>
                <small>${this.escapeHtml([item.ratingLabel ? `★ ${item.ratingLabel}` : '', item.distanceLabel].filter(Boolean).join(' · '))}</small>
            </button>
        `).join('');
    }

    googlePlacesStoriesEnabled() {
        return this.hasUserCoordinates()
            && this.googlePlacesProxyEnabled === true
            && this.enabledSetting(this.googlePlacesSettings.include_photos, true);
    }

    placesStoryRatingLabel(location) {
        if (!this.enabledSetting(this.googlePlacesSettings.include_ratings, true)) {
            return '';
        }

        const rating = Number(location.rating ?? location.meta?.rating);
        return Number.isFinite(rating) ? rating.toFixed(1) : '';
    }

    categoryVisualPillsMarkup(locations) {
        const categoryKeys = this.availableCategoryKeys(locations).slice(0, 7);
        return categoryKeys.map((categoryKey) => {
            const isAll = categoryKey === 'all';
            const label = isAll ? 'Todo' : this.categoryDisplayName(categoryKey);
            return `
                <button
                    type="button"
                    class="mobile-map-app__category-orbit-item ${this.activeCategoryFilter === categoryKey ? 'is-active' : ''}"
                    data-category-filter="${this.escapeHtml(categoryKey)}"
                    data-action="map-shell#applyCategoryFilter"
                    ${!isAll ? `style="--category-orbit-color:${this.escapeHtml(this.categoryColor(categoryKey))};"` : ''}
                >
                    <span>${this.categoryIconSvg(categoryKey)}</span>
                    <strong>${this.escapeHtml(label)}</strong>
                </button>
            `;
        }).join('');
    }

    nearbyCategoryCardsMarkup(locations) {
        if (!this.hasUserCoordinates()) {
            return this.nearbyCategoryEmptyMarkup(
                'Elige una ubi para ver categorías cercanas',
                'Las categorías se arman con los locales encontrados alrededor de tu zona.'
            );
        }

        const summaries = this.nearbyCategorySummaries(locations);
        if (summaries.length === 0) {
            return this.nearbyCategoryEmptyMarkup(
                'Sin categorías suficientes',
                'Prueba otra fuente, cambia el servicio o mueve el mapa para descubrir más opciones.'
            );
        }

        return summaries.slice(0, 8).map((summary) => {
            const style = summary.photoUrl
                ? `style="--nearby-category-color:${this.escapeHtml(summary.colorHex)}; background-image:linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.68)), url('${this.escapeHtml(summary.photoUrl)}');"`
                : `style="--nearby-category-color:${this.escapeHtml(summary.colorHex)};"`;

            return `
                <button
                    type="button"
                    class="mobile-map-app__nearby-category-card ${summary.photoUrl ? 'has-photo' : ''} ${this.activeCategoryFilter === summary.slug ? 'is-active' : ''}"
                    ${style}
                    data-category-filter="${this.escapeHtml(summary.slug)}"
                    data-action="map-shell#applyCategoryFilter"
                >
                    <span class="mobile-map-app__nearby-category-icon">${this.categoryIconSvg(summary.slug)}</span>
                    <span class="mobile-map-app__nearby-category-meta">${this.escapeHtml(summary.countLabel)}</span>
                    <strong>${this.escapeHtml(summary.label)}</strong>
                    <small>${this.escapeHtml(summary.copy)}</small>
                </button>
            `;
        }).join('');
    }

    nearbyCategoryEmptyMarkup(title, copy) {
        return `
            <article class="mobile-map-app__nearby-category-empty">
                <strong>${this.escapeHtml(title)}</strong>
                <p>${this.escapeHtml(copy)}</p>
            </article>
        `;
    }

    nearbyCategorySummaries(locations) {
        const groups = new Map();

        locations.forEach((location) => {
            const slug = this.locationCategoryKey(location);
            if (slug === 'all') {
                return;
            }

            if (!groups.has(slug)) {
                groups.set(slug, []);
            }
            groups.get(slug).push(location);
        });

        return [...groups.entries()]
            .map(([slug, groupLocations]) => {
                const sourceGroups = new Set(groupLocations.map((location) => this.locationSourceGroup(location)));
                const catalogIndex = this.categoryCatalog.findIndex((category) => String(category.slug) === slug);
                const serviceLabel = this.activeServiceFilter === 'all'
                    ? 'opciones cerca'
                    : this.serviceFilterDisplayName(this.activeServiceFilter).toLowerCase();

                return {
                    slug,
                    catalogIndex: catalogIndex === -1 ? Number.MAX_SAFE_INTEGER : catalogIndex,
                    label: this.categoryDisplayName(slug),
                    colorHex: this.categoryColor(slug),
                    photoUrl: this.categoryVisualPhotoUrl(slug, groupLocations),
                    count: groupLocations.length,
                    countLabel: `${groupLocations.length} ${groupLocations.length === 1 ? 'lugar' : 'lugares'}`,
                    copy: sourceGroups.size > 1
                        ? `${serviceLabel} de Mi Monchis y Places`
                        : `${serviceLabel} en ${sourceGroups.has('google') ? 'Places' : 'Mi Monchis'}`,
                };
            })
            .sort((left, right) => {
                if (left.catalogIndex !== right.catalogIndex) {
                    return left.catalogIndex - right.catalogIndex;
                }

                return right.count - left.count || left.label.localeCompare(right.label, 'es');
            });
    }

    communityReviewTeasersMarkup(locations) {
        const candidates = locations.slice(0, 2);
        if (candidates.length === 0) {
            return '<article class="mobile-map-app__review-teaser"><strong>Sin reseñas aún</strong><p>La comunidad empezará a aparecer aquí conforme el alpha avance.</p></article>';
        }

        return candidates.map((location, index) => `
            <article class="mobile-map-app__review-teaser">
                <div class="mobile-map-app__review-photo mobile-map-card__media--${this.mediaTone(location)} ${this.locationVisualPhotoUrl(location) ? 'has-photo' : ''}" ${this.mediaStyle(location)}>
                    <span>★ ${this.escapeHtml(this.locationRating(location))}</span>
                </div>
                <div>
                    <strong>${index === 0 ? 'Ana G.' : 'Carlos R.'}</strong>
                    <p>${this.escapeHtml(this.shortLocationName(location))} en ${this.escapeHtml(location.location_name ?? 'Mi Monchis')}</p>
                </div>
            </article>
        `).join('');
    }

    async openVisualLocation(event) {
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
    }

    shortLocationName(location) {
        const name = location.location_name ?? location.merchant_name ?? 'Local';
        return String(name).split(/\s+/).slice(0, 2).join(' ');
    }

    locationAvatarLabel(location) {
        const category = this.locationCategoryKey(location);
        if (category !== 'all') {
            return this.categoryDisplayName(category).slice(0, 1).toUpperCase();
        }

        return (location.location_name ?? location.merchant_name ?? 'M').slice(0, 1).toUpperCase();
    }

    locationRating(location) {
        const rating = Number(location.rating ?? location.meta?.rating ?? 4.8);
        return Number.isFinite(rating) ? rating.toFixed(1) : '4.8';
    }

    categoryIconSvg(categoryKey) {
        const normalized = this.normalizeComparisonText(categoryKey);
        if (normalized.includes('taco')) {
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15c2-5 6-8 12-8 2 0 4 2 4 4v4H4Z"/><path d="M7 15c1-2 3-3 5-3s4 1 5 3"/><path d="M8 10h.01M12 9h.01M16 10h.01"/></svg>';
        }
        if (normalized.includes('hamburg') || normalized.includes('burger')) {
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11c1-4 4-6 7-6s6 2 7 6H5Z"/><path d="M4 14h16"/><path d="M5 18h14"/><path d="M7 11h.01M12 9h.01M17 11h.01"/></svg>';
        }
        if (normalized.includes('cafe') || normalized.includes('coffee')) {
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 4v2M12 4v2"/></svg>';
        }
        if (normalized.includes('sushi')) {
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="10" rx="2"/><circle cx="10" cy="12" r="2"/><path d="M14 10h3M14 14h3"/></svg>';
        }
        if (categoryKey === 'all') {
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/><path d="M5 19 19 5"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"/><path d="M6 7h12"/><path d="M8 17h8"/><path d="M12 4v16"/></svg>';
    }

    renderListSkeleton(count = 4) {
        const markup = Array.from({ length: count }, () => `
            <article class="mobile-map-card mobile-map-card--placeholder" aria-hidden="true">
                <div class="mobile-map-card__media mobile-map-card__media--placeholder placeholder-glow">
                    <span class="placeholder mobile-map-card__placeholder-photo"></span>
                </div>
                <div class="mobile-map-card__body placeholder-glow">
                    <span class="placeholder mobile-map-card__placeholder-line mobile-map-card__placeholder-line--title"></span>
                    <span class="placeholder mobile-map-card__placeholder-line"></span>
                    <span class="placeholder mobile-map-card__placeholder-line mobile-map-card__placeholder-line--short"></span>
                    <div class="mobile-map-card__placeholder-meta">
                        <span class="placeholder mobile-map-card__placeholder-pill"></span>
                        <span class="placeholder mobile-map-card__placeholder-pill mobile-map-card__placeholder-pill--short"></span>
                    </div>
                </div>
            </article>
        `).join('');

        if (this.hasListTarget) {
            this.listTarget.innerHTML = markup;
        }

        if (this.hasExploreListGridTarget) {
            this.exploreListGridTarget.innerHTML = markup;
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
        const filtered = locations.filter((location) => {
            const matchesCategory = this.activeCategoryFilter === 'all' || this.locationCategoryKey(location) === this.activeCategoryFilter;
            const matchesJoyita = !this.joyitasOnly || this.locationIsJoyita(location);
            const matchesSource = this.activeSourceFilter === 'all' || this.locationSourceGroup(location) === this.activeSourceFilter;
            const matchesService = this.locationMatchesService(location);
            const matchesSearch = this.locationMatchesSearch(location);

            return matchesCategory && matchesJoyita && matchesSource && matchesService && matchesSearch;
        });

        return this.sortLocations(filtered);
    }

    sortLocations(locations) {
        const sorted = [...locations];
        if (this.activeSortFilter === 'rating') {
            return sorted.sort((left, right) => {
                const leftRating = typeof left.rating === 'number' ? left.rating : -1;
                const rightRating = typeof right.rating === 'number' ? right.rating : -1;
                if (rightRating !== leftRating) {
                    return rightRating - leftRating;
                }

                const leftReviews = Number.isInteger(left.user_ratings_total) ? left.user_ratings_total : 0;
                const rightReviews = Number.isInteger(right.user_ratings_total) ? right.user_ratings_total : 0;
                if (rightReviews !== leftReviews) {
                    return rightReviews - leftReviews;
                }

                return (left.distance_meters ?? Infinity) - (right.distance_meters ?? Infinity);
            });
        }

        return sorted.sort((left, right) => (left.distance_meters ?? Infinity) - (right.distance_meters ?? Infinity));
    }

    async applySortFilter(event) {
        this.activeSortFilter = event.currentTarget.dataset.sortFilter ?? 'distance';
        const triggeredFromMenu = event.currentTarget.closest('.mobile-map-app__menu') !== null;
        this.renderCategoryChips(this.currentLocations);
        if (triggeredFromMenu) {
            this.closeMenu();
        }

        await this.applyVisibleFilters('No encontré locales con ese orden.');
        this.logInteraction('public_sort_filter_changed', 'ui_filter', null, { sort_filter: this.activeSortFilter });
    }

    locationMatchesSearch(location) {
        const query = this.normalizeComparisonText(this.activeSearchQuery ?? '');
        if (query === '') {
            return true;
        }

        const haystack = this.normalizeComparisonText([
            location.location_name,
            location.merchant_name,
            location.short_address,
            location.category_name,
            location.category_slug,
            this.locationCategoryKey(location) !== 'all' ? this.categoryDisplayName(this.locationCategoryKey(location)) : '',
        ].filter(Boolean).join(' '));

        return haystack.includes(query);
    }

    renderCategoryChips(locations) {
        if (!this.hasChipRowTarget || !this.hasSourceFilterRowTarget) {
            return;
        }

        const categoryKeys = this.availableCategoryKeys(this.categoryChipContextLocations(locations));
        if (!categoryKeys.includes(this.activeCategoryFilter) && this.activeCategoryFilter !== 'all') {
            this.activeCategoryFilter = 'all';
        }

        if (!this.availableSourceKeys(locations).includes(this.activeSourceFilter)) {
            this.activeSourceFilter = 'all';
        }

        this.sourceFilterRowTarget.innerHTML = this.sourceFilterSegmentedMarkup(locations);
        if (this.hasMenuSourceFilterRowTarget) {
            this.menuSourceFilterRowTarget.innerHTML = this.sourceFilterSegmentedMarkup(locations, 'menu');
        }
        if (this.hasSortFilterRowTarget) {
            this.sortFilterRowTarget.innerHTML = this.sortFilterMarkup();
        }
        if (this.hasMenuSortFilterRowTarget) {
            this.menuSortFilterRowTarget.innerHTML = this.sortFilterMarkup('menu');
        }

        const categoryMarkup = categoryKeys.map((categoryKey) => {
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

        this.chipRowTarget.innerHTML = categoryMarkup;
        if (this.hasMenuCategoryListTarget) {
            this.menuCategoryListTarget.innerHTML = categoryMarkup || '<span class="mobile-map-app__menu-empty">Sin categorías disponibles</span>';
        }
    }

    sortFilterMarkup(variant = 'segmented') {
        const options = [
            ['distance', 'Más cercanos'],
            ['rating', 'Mejor calificados'],
        ];

        return options.map(([sortKey, label]) => `
            <button
                type="button"
                class="${variant === 'menu' ? 'mobile-map-app__menu-filter' : 'mobile-map-app__sort-filter'} ${this.activeSortFilter === sortKey ? 'is-active' : ''}"
                data-sort-filter="${this.escapeHtml(sortKey)}"
                data-action="map-shell#applySortFilter"
            >
                ${this.escapeHtml(label)}
            </button>
        `).join('');
    }

    sourceFilterSegmentedMarkup(locations, variant = 'segmented') {
        const availableSources = this.availableSourceKeys(locations);
        if (availableSources.length <= 1) {
            return '';
        }

        const sources = [
            ['all', 'Todas las fuentes'],
            ['mimonchis', 'Mi Monchis'],
            ['google', 'Places'],
        ];

        return sources
            .map(([sourceKey, label]) => `
                <button
                    type="button"
                    class="${variant === 'menu' ? 'mobile-map-app__menu-filter' : 'mobile-map-app__segmented-btn'} ${this.activeSourceFilter === sourceKey ? 'is-active' : ''}"
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

    categoryChipContextLocations(locations) {
        return locations.filter((location) => {
            const matchesJoyita = !this.joyitasOnly || this.locationIsJoyita(location);
            const matchesSource = this.activeSourceFilter === 'all' || this.locationSourceGroup(location) === this.activeSourceFilter;
            const matchesService = this.locationMatchesService(location);

            return matchesJoyita && matchesSource && matchesService;
        });
    }

    categoryCardContextLocations(locations) {
        return this.categoryChipContextLocations(locations).filter((location) => this.locationMatchesSearch(location));
    }

    availableCategoryKeys(locations) {
        const discoveredCategories = new Set();

        locations.forEach((location) => {
            const category = this.locationCategoryKey(location);
            if (category !== 'all') {
                discoveredCategories.add(category);
            }
        });

        const catalogOrderedDiscovered = this.categoryCatalog
            .map((category) => String(category.slug))
            .filter((slug) => slug !== '' && discoveredCategories.has(slug));
        const remainingFallback = [...discoveredCategories].filter((slug) => !catalogOrderedDiscovered.includes(slug));

        return ['all', ...catalogOrderedDiscovered, ...remainingFallback];
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
        if (this.hasStatusTarget) {
            this.statusTarget.textContent = message;
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

    async refreshProfileSummary() {
        if (!this.authenticatedValue || !this.hasMeUrlValue || this.meUrlValue === '') {
            return;
        }

        try {
            const payload = await this.requestJson(this.meUrlValue, { method: 'GET' });
            this.profilePayload = payload.data ?? null;
            this.renderProfileSummary();
        } catch (error) {
            if (this.hasProfileStatusTarget) {
                this.profileStatusTarget.textContent = 'No disponible';
            }
            if (this.hasProfileLegalListTarget) {
                this.profileLegalListTarget.innerHTML = '<p>No pude cargar el estado legal de la cuenta.</p>';
            }
        }
    }

    renderProfileSummary() {
        if (!this.profilePayload) {
            return;
        }

        if (this.hasProfileStatusTarget) {
            this.profileStatusTarget.textContent = this.profilePayload.email_verified ? 'Verificada' : 'Pendiente';
        }

        if (this.hasProfileLegalListTarget) {
            const acceptances = Array.isArray(this.profilePayload.legal_acceptances)
                ? this.profilePayload.legal_acceptances
                : [];

            if (acceptances.length === 0) {
                this.profileLegalListTarget.innerHTML = '<p>Aún no hay aceptaciones legales persistidas para esta cuenta.</p>';
                return;
            }

            this.profileLegalListTarget.innerHTML = acceptances.map((acceptance) => `
                <div class="mobile-map-app__legal-status-item">
                    <span>${this.escapeHtml(this.humanizeLegalSlug(acceptance.document_slug))}</span>
                    <strong>${this.escapeHtml(acceptance.version_label ?? 'Sin versión')}</strong>
                    <small>${this.escapeHtml(this.formatDateTime(acceptance.accepted_at))}</small>
                </div>
            `).join('');
        }
    }

    renderFavoritesSummary() {
        const count = String(this.favoriteItems.length);

        if (this.hasFavoritesCountTarget) {
            this.favoritesCountTarget.textContent = count;
        }
        if (this.hasFavoritesCountDuplicateTarget) {
            this.favoritesCountDuplicateTarget.textContent = count;
        }
        if (this.hasFavoritesListTarget) {
            if (this.favoriteItems.length === 0) {
                this.favoritesListTarget.innerHTML = '<div class="public-home__empty-card">Todavía no has guardado ningún local.</div>';
                return;
            }

            this.favoritesListTarget.innerHTML = this.favoriteItems
                .map((favorite) => {
                    const location = this.currentLocations.find((candidate) => this.favoriteKeyForLocation(candidate) === favorite.favorite_key) ?? null;
                    const snapshot = favorite.snapshot ?? {};
                    const title = location?.location_name ?? snapshot.name ?? (favorite.source_type === 'google_places' ? 'Place guardado' : `Local #${favorite.location_id}`);
                    const subtitle = location ? this.cardSubtitle(location) : (snapshot.address ?? 'Guardado desde la exploración pública.');
                    const profileUrl = location ? this.buildProfileUrl(location) : this.profileUrlForFavorite(favorite);
                    const distance = location?.distance_meters ? `${this.formatDistance(location.distance_meters)} de tu zona actual` : '';
                    const sourceLabel = location ? this.sourceTypeLabel(location.source_type) : (favorite.source_type === 'google_places' ? 'Places' : 'Mi Monchis');
                    const degraded = !location && favorite.source_type === 'google_places' ? '<small>Guardado externo. Si Places está apagado, solo podrás quitarlo hasta volver a cargarlo.</small>' : '';

                    return `
                    <article class="public-home__saved-row">
                        <div>
                            <strong>${this.escapeHtml(title)}</strong>
                            <p>${this.escapeHtml(subtitle)} · ${this.escapeHtml(sourceLabel)}</p>
                            ${distance ? `<small>${this.escapeHtml(distance)}</small>` : ''}
                            ${degraded}
                        </div>
                        <div class="public-home__saved-actions">
                            <a class="public-home__inline-button" href="${this.escapeHtml(profileUrl)}">Ver perfil</a>
                            ${location ? `<button
                                type="button"
                                class="public-home__inline-button"
                                data-action="click->map-shell#focusFavoriteFromList"
                                data-favorite-key="${this.escapeHtml(favorite.favorite_key)}"
                            >
                                Ver en mapa
                            </button>` : ''}
                            <button
                                type="button"
                                class="public-home__inline-button"
                                data-action="map-shell#removeFavoriteFromList"
                                data-favorite-key="${this.escapeHtml(favorite.favorite_key)}"
                            >
                                Quitar
                            </button>
                        </div>
                    </article>
                `;
                })
                .join('');
        }
    }

    async focusFavoriteFromList(event) {
        const favoriteKey = event.currentTarget.dataset.favoriteKey ?? '';
        const location = this.currentLocations.find((candidate) => this.favoriteKeyForLocation(candidate) === favoriteKey) ?? null;
        if (!location) {
            this.setStatus('Ese favorito no está cargado en la zona actual.');
            return;
        }

        this.setSelectedLocation(this.locationKey(location));
        this.activeSection = 'explore';
        this.renderActiveSection();
        this.renderList(this.visibleLocations);
        await this.renderCanvas(this.visibleLocations);
        this.focusMapLocation(location);
        this.renderDetailSheet(await this.enrichLocationIfNeeded(location));
    }

    profileUrlForFavorite(favorite) {
        if (favorite.source_type === 'google_places' && favorite.external_source_key) {
            return `/l/google_${encodeURIComponent(String(favorite.external_source_key))}`;
        }

        return favorite.location_id ? `/l/${encodeURIComponent(String(favorite.location_id))}` : '#';
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

    renderServiceFilterSummary() {
        if (!this.hasServiceFilterLabelTarget) {
            return;
        }

        const label = this.serviceFilterDisplayName(this.activeServiceFilter);
        this.serviceFilterLabelTargets.forEach((target) => {
            target.textContent = label;
        });
    }

    syncFavoriteButtons() {
        this.element.querySelectorAll('[data-favorite-key]').forEach((element) => {
            if (!element.classList.contains('mobile-map-card__heart') && !element.classList.contains('mobile-map-app__detail-float-button--favorite')) {
                return;
            }

            const isFavorite = this.favoriteItems.some((favorite) => favorite.favorite_key === element.dataset.favoriteKey);
            element.classList.toggle('is-active', isFavorite);
            element.setAttribute('aria-label', isFavorite ? 'Quitar favorito' : 'Guardar favorito');
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
                    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: this.streetLabelColor() }, { weight: this.streetLabelWeight() }] },
                    { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#f8f3e8' }, { weight: 1 }] },
                    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d9eef9' }] },
                    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f8f3e8' }] },
                ],
            });
            this.infoWindow = new google.maps.InfoWindow();
            this.directionsService = new google.maps.DirectionsService();
            this.directionsRenderer = new google.maps.DirectionsRenderer({
                map: this.map,
                preserveViewport: false,
                suppressMarkers: false,
                polylineOptions: {
                    strokeColor: '#f27f0d',
                    strokeOpacity: 0.95,
                    strokeWeight: 5,
                },
            });
            this.initializeMapDiscoveryListener(google);
        }

        this.map.setMapTypeId(this.currentMapTypeId);
        if (this.directionsRenderer && !options.keepRoute) {
            this.clearInternalRoute({ silent: true });
        }

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
                this.map.setZoom(this.defaultMapZoom());
                this.rememberCurrentMapCenter();
                this.isSyncingMapViewport = false;
                this.setCanvasNote(locations.length === 0
                    ? 'Ya ubicamos tu zona, pero todavía no hay locales visibles publicados.'
                    : 'Ubicamos tu zona, pero los locales visibles aún no traen coordenadas publicadas.');
                return;
            }

            this.map.setCenter({ lat: 19.432608, lng: -99.133209 });
            this.map.setZoom(13);
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
        } else if (this.pendingViewportCenter && Number.isFinite(this.pendingViewportCenter.lat) && Number.isFinite(this.pendingViewportCenter.lng)) {
            this.map.setCenter(this.pendingViewportCenter);
            this.map.setZoom(this.defaultMapZoom());
            this.pendingViewportCenter = null;
        } else if (hasUserCoordinates && validLocations.length > 0) {
            this.map.setCenter(this.currentUserPosition());
            this.map.setZoom(this.defaultMapZoom());
        } else if (hasUserCoordinates) {
            this.map.setCenter(this.currentUserPosition());
            this.map.setZoom(this.defaultMapZoom());
        } else if (validLocations.length === 1) {
            this.map.setCenter(bounds.getCenter());
            this.map.setZoom(this.defaultMapZoom());
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
        this.map.setZoom(this.focusedMapZoom());
        this.openInfoWindow(location, marker);
        window.setTimeout(() => {
            this.rememberCurrentMapCenter();
            this.isSyncingMapViewport = false;
        }, 180);
    }

    clearInternalRoute(options = {}) {
        if (this.directionsRenderer) {
            this.directionsRenderer.set('directions', null);
        }

        this.activeRouteKey = null;
        this.activeRouteLocationName = null;
        this.setRouteState('idle');

        if (!options.silent) {
            this.setStatus('Ruta interna cerrada.');
        }
    }

    async startInternalRoute(event) {
        const locationKey = event.currentTarget.dataset.locationKey ?? this.selectedLocationId ?? '';
        const location = this.currentLocations.find((item) => this.locationKey(item) === locationKey) ?? null;
        if (!location) {
            this.setStatus('No pude identificar el destino de la ruta.');
            this.setRouteState('route_error', 'Destino no disponible', 'Vuelve a abrir el local e intenta de nuevo.');
            return;
        }

        const origin = this.currentUserPosition();
        const destination = {
            lat: Number(location.lat),
            lng: Number(location.lng),
        };

        if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
            const permissionState = await this.geolocationPermissionState();
            if (permissionState === 'denied') {
                this.setRouteState('permission_denied', 'Permiso de ubicación denegado', 'Activa ubicación o elige una ubi guardada para trazar ruta.');
                this.setStatus('Permiso de ubicación denegado. Usa una ubi guardada o habilita geolocalización.');
                return;
            }

            this.setRouteState('origin_missing', 'Falta origen', 'Elige una ubi o usa geolocalización para trazar ruta.');
            this.setStatus('Elige una ubi o usa geolocalización para trazar ruta dentro de Mi Monchis.');
            return;
        }

        if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
            this.setRouteState('route_error', 'Destino sin coordenadas', 'Este local todavía no tiene datos suficientes para ruta interna.');
            this.setStatus('Este local todavía no tiene coordenadas suficientes para ruta interna.');
            return;
        }

        this.activeSection = 'explore';
        this.setMapMode();
        this.renderActiveSection();
        this.closeDetailSheet();
        this.clearInternalRoute({ silent: true });
        this.setRouteState('route_loading', 'Trazando ruta', location.location_name ?? 'Destino seleccionado');
        this.setStatus('Trazando ruta dentro de Mi Monchis...');

        try {
            const google = await this.loadGoogleMaps();
            await this.renderCanvas(this.visibleLocations, { preserveViewport: true, keepRoute: true });
            if (!this.directionsService || !this.directionsRenderer) {
                throw new Error('El servicio de rutas no está disponible.');
            }

            const route = await new Promise((resolve, reject) => {
                this.directionsService.route({
                    origin,
                    destination,
                    travelMode: google.maps.TravelMode.WALKING,
                    provideRouteAlternatives: false,
                }, (result, status) => {
                    if (status === google.maps.DirectionsStatus.OK && result) {
                        resolve(result);
                        return;
                    }

                    reject(new Error(this.googlePlacesStatusMessage(status)));
                });
            });

            this.directionsRenderer.setDirections(route);
            this.activeRouteKey = locationKey;
            this.activeRouteLocationName = location.location_name ?? 'Destino seleccionado';
            const leg = route.routes?.[0]?.legs?.[0] ?? null;
            const distance = leg?.distance?.text ?? this.formatDistance(location.distance_meters);
            const duration = leg?.duration?.text ?? 'tiempo estimado';
            this.setRouteState('route_ready', `Ruta a ${this.activeRouteLocationName}`, `${distance}, ${duration}`);
            this.setStatus(`Ruta lista: ${distance}, ${duration}.`);
            this.logInteraction('public_internal_route_started', 'location', Number(location.location_id) || null, {
                source_type: location.source_type ?? null,
                location_key: locationKey,
            });
        } catch (error) {
            this.setRouteState('route_error', 'No se pudo trazar ruta', 'Usa Cómo llegar como respaldo externo.');
            this.setStatus(`No pude trazar la ruta interna. Puedes abrir Maps como respaldo.`);
            this.logInteraction('public_internal_route_failed', 'location', Number(location.location_id) || null, {
                source_type: location.source_type ?? null,
                location_key: locationKey,
                error: error.message,
            });
        }
    }

    async geolocationPermissionState() {
        if (!navigator.permissions?.query) {
            return 'unknown';
        }

        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            return result.state ?? 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }

    setRouteState(state, status = '', meta = '') {
        this.routeState = state;
        if (!this.hasRoutePanelTarget) {
            return;
        }

        const isIdle = state === 'idle';
        this.routePanelTarget.classList.toggle('is-hidden', isIdle);
        this.routePanelTarget.dataset.routeState = state;

        if (this.hasRouteStatusTarget) {
            this.routeStatusTarget.textContent = status || 'Ruta dentro de Mi Monchis';
        }
        if (this.hasRouteMetaTarget) {
            this.routeMetaTarget.textContent = meta || '';
        }
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

        if (!this.hasWalkthroughCopyTarget) {
            return;
        }

        this.walkthroughCopyTarget.textContent = '';

        if (this.hasWalkthroughLogoTarget) {
            this.walkthroughLogoTarget.classList.remove('is-hidden');
            this.walkthroughLogoTarget.classList.add('is-visible');
        }

        const typeNextCharacter = () => {
            this.walkthroughCopyTarget.textContent = message.slice(0, index);

            if (index < message.length) {
                index += 1;
                this.walkthroughTypingTimer = window.setTimeout(typeNextCharacter, 34);
                return;
            }

            window.setTimeout(() => {
                if (this.hasWalkthroughFormTarget) {
                    this.walkthroughFormTarget.classList.remove('is-hidden');
                    this.walkthroughFormTarget.classList.add('is-visible');
                }
            }, 180);

            window.setTimeout(() => {
                if (this.hasWalkthroughGeoButtonTarget) {
                    this.walkthroughGeoButtonTarget.classList.remove('is-hidden');
                    this.walkthroughGeoButtonTarget.classList.add('is-visible');
                }
            }, 280);
        };

        typeNextCharacter();
    }

    goBackFromWalkthrough() {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        this.setWalkthroughError('No hay una pantalla anterior disponible en esta sesión.');
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
        this.pendingViewportCenter = this.hasUserCoordinates() ? this.currentUserPosition() : null;
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

    updateHeroLocation(label, options = {}) {
        const displayLabel = this.describeLocationLabel(label);
        if (this.hasHeroLocationTarget && displayLabel) {
            this.heroLocationTarget.textContent = displayLabel;
        }
        if (this.hasHeroLocationDesktopTarget && displayLabel) {
            this.heroLocationDesktopTarget.textContent = displayLabel;
        }
        if (label) {
            this.currentLocationLabel = displayLabel;
            if (options.persist !== false) {
                this.persistLocationContext();
            }
        }
    }

    describeLocationLabel(label) {
        const rawLabel = String(label ?? '').trim();
        if (rawLabel === '') {
            return '';
        }

        const normalized = this.normalizeComparisonText(rawLabel);
        if (/^(avenida|av|calzada|calz|boulevard|blvd|carretera|colonia|col|codigo postal|cp|zona|ubicacion actual)\b/.test(normalized)) {
            return rawLabel;
        }

        if (/^\d{5}(\b|$)/.test(rawLabel)) {
            return `Código postal ${rawLabel}`;
        }

        if (/\b(av|av\.|avenida|calzada|calz\.|boulevard|blvd\.|carretera)\b/i.test(rawLabel) || /\d/.test(rawLabel)) {
            return `Avenida ${rawLabel}`;
        }

        return `Colonia ${rawLabel}`;
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
        const address = this.escapeHtml(this.compactAddressLabel(location.short_address));
        const statusLabel = this.escapeHtml(this.publicationStatusLabel(location));
        const statusClass = this.infoWindowStatusClass(location);
        const distanceLabel = location.distance_meters != null ? this.escapeHtml(this.formatDistance(location.distance_meters)) : 'Zona cercana';
        const sourceLabel = this.escapeHtml(this.sourceTypeLabel(location.source_type));
        const directionsUrl = this.buildDirectionsUrl(location);
        const reviewsLabel = this.escapeHtml(this.reviewsLabel(location));
        const categoryKey = this.locationCategoryKey(location);
        const categoryMarkup = categoryKey !== 'all'
            ? `<span class="map-shell__info-window-badge map-shell__info-window-badge--category">${this.escapeHtml(this.categoryDisplayName(categoryKey))}</span>`
            : '';
        const detailKey = this.escapeHtml(this.locationKey(location));

        return `
            <article class="map-shell__info-window">
                <header class="map-shell__info-window-header">
                    <div>
                        <strong>${locationName}</strong>
                        <p class="map-shell__info-window-address">${address}</p>
                    </div>
                    <div class="map-shell__info-window-badge-stack">
                        ${categoryMarkup}
                        <span class="map-shell__info-window-badge ${statusClass}">${statusLabel}</span>
                        <span class="map-shell__info-window-badge map-shell__info-window-badge--source">${sourceLabel}</span>
                    </div>
                </header>
                <div class="map-shell__info-window-meta">
                    <span>${distanceLabel}</span>
                    <span>${reviewsLabel}</span>
                </div>
                <div class="map-shell__info-window-actions">
                    <button type="button" data-action="click->map-shell#openLocationFromInfoWindow" data-location-key="${detailKey}">Ver ficha</button>
                    ${directionsUrl ? `<a href="${this.escapeHtml(directionsUrl)}" target="_blank" rel="noreferrer">Cómo llegar</a>` : ''}
                </div>
            </article>
        `;
    }

    publicationStatusLabel(location) {
        if (location.source_type === 'google_places') {
            if (this.locationBusinessStatus(location) === 'CLOSED_PERMANENTLY') {
                return 'Cerrado';
            }

            if (this.locationBusinessStatus(location) === 'CLOSED_TEMPORARILY') {
                return 'Cerrado temporal';
            }

            if (this.locationIsOpen(location) === true) {
                return 'Abierto';
            }

            if (this.locationIsOpen(location) === false) {
                return 'Cerrado';
            }

            return 'Sin horario';
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
            if (
                this.locationIsOpen(location) === false
                || this.locationBusinessStatus(location) === 'CLOSED_PERMANENTLY'
                || this.locationBusinessStatus(location) === 'CLOSED_TEMPORARILY'
            ) {
                return 'mobile-map-card__status--closed';
            }

            if (this.locationIsOpen(location) === true) {
                return 'mobile-map-card__status--discovered';
            }

            return 'mobile-map-card__status--pending';
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
            return 'Places';
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

    registerMapSettings(settings) {
        const defaultZoom = Number(settings?.default_zoom ?? this.mapSettings.defaultZoom);
        const focusedZoom = Number(settings?.focused_zoom ?? this.mapSettings.focusedZoom);
        const streetLabelWeight = String(settings?.street_label_weight ?? this.mapSettings.streetLabelWeight);

        this.mapSettings = {
            defaultZoom: this.clampNumber(defaultZoom, 10, 20, 18),
            focusedZoom: this.clampNumber(focusedZoom, 10, 20, 18),
            streetLabelWeight: streetLabelWeight === 'light' ? 'light' : 'normal',
        };
    }

    registerGooglePlacesSettings(settings) {
        this.googlePlacesSettings = {
            include_photos: this.enabledSetting(settings?.include_photos, this.googlePlacesSettings.include_photos),
            include_ratings: this.enabledSetting(settings?.include_ratings, this.googlePlacesSettings.include_ratings),
            include_opening_hours: this.enabledSetting(settings?.include_opening_hours, this.googlePlacesSettings.include_opening_hours),
            include_service_attributes: this.enabledSetting(settings?.include_service_attributes, this.googlePlacesSettings.include_service_attributes),
        };
    }

    enabledSetting(value, fallback = true) {
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'number') {
            return value === 1;
        }

        if (typeof value === 'string') {
            return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
        }

        return fallback;
    }

    defaultMapZoom() {
        return this.mapSettings.defaultZoom;
    }

    focusedMapZoom() {
        return this.mapSettings.focusedZoom;
    }

    streetLabelColor() {
        return this.mapSettings.streetLabelWeight === 'light' ? '#64748b' : '#475569';
    }

    streetLabelWeight() {
        return this.mapSettings.streetLabelWeight === 'light' ? 0.55 : 0.8;
    }

    clampNumber(value, min, max, fallback) {
        return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
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
                defaultPhotoUrl: catalogCategory.default_photo_url ? String(catalogCategory.default_photo_url) : '',
                coverPhotoUrl: catalogCategory.cover_photo_url ? String(catalogCategory.cover_photo_url) : '',
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
            defaultPhotoUrl: '',
            coverPhotoUrl: '',
        };
    }

    categoryVisualPhotoUrl(categoryKey, locations = []) {
        const categoryInfo = this.categoryInfo(categoryKey);
        const representativeLocation = locations.find((location) => this.locationVisualPhotoUrl(location));

        return categoryInfo.coverPhotoUrl
            || categoryInfo.defaultPhotoUrl
            || this.locationVisualPhotoUrl(representativeLocation ?? {})
            || null;
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
        const sourceType = String(location.source_type ?? '').toLowerCase();

        return ['google_places', 'google', 'places'].includes(sourceType) ? 'google' : 'mimonchis';
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

    serviceFilterDisplayName(filterKey) {
        switch (filterKey) {
            case 'dine_in':
                return 'Comer en el lugar';
            case 'delivery':
                return 'Servicio a domicilio';
            case 'takeaway':
                return 'Para llevar';
            case 'all':
            default:
                return 'Todo';
        }
    }

    locationMatchesService(location) {
        if (this.activeServiceFilter === 'all') {
            return true;
        }

        const explicitDelivery = location.service_delivery === true;
        const explicitTakeaway = location.service_takeaway === true;
        const explicitDineIn = location.service_dine_in === true;
        const types = Array.isArray(location.types) ? location.types.map((type) => String(type).toLowerCase()) : [];

        const inferredDelivery = explicitDelivery || types.includes('meal_delivery') || Boolean(location.whatsapp_enabled);
        const inferredTakeaway = explicitTakeaway || types.includes('meal_takeaway');
        const inferredDineIn = explicitDineIn || types.some((type) => [
            'restaurant',
            'cafe',
            'bar',
            'bakery',
            'coffee_shop',
            'fast_food_restaurant',
            'mexican_restaurant',
            'seafood_restaurant',
        ].includes(type));

        switch (this.activeServiceFilter) {
            case 'delivery':
                return inferredDelivery;
            case 'takeaway':
                return inferredTakeaway;
            case 'dine_in':
                return inferredDineIn;
            default:
                return true;
        }
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
            this.notificationsBadgeTarget.textContent = String(this.notificationsUnreadCount);
            this.notificationsBadgeTarget.classList.toggle('is-hidden', this.notificationsUnreadCount <= 0);
        }
    }

    renderMenuState() {
        if (!this.hasMenuPanelTarget) {
            return;
        }

        this.menuPanelTarget.classList.toggle('is-hidden', !this.menuOpen);
        this.menuPanelTarget.classList.toggle('is-visible', this.menuOpen);
        document.documentElement.classList.toggle('has-public-menu-open', this.menuOpen);
    }

    renderLocationSwitcherState() {
        if (!this.hasLocationSwitcherTarget) {
            return;
        }

        this.locationSwitcherTarget.classList.toggle('is-hidden', !this.locationSwitcherOpen);
        this.locationSwitcherTarget.classList.toggle('is-service-menu', this.locationSwitcherOpen && this.locationSwitcherMode === 'services');
        this.locationSwitcherTarget.classList.toggle('is-location-menu', this.locationSwitcherOpen && this.locationSwitcherMode !== 'services');

        if (this.locationSwitcherOpen) {
            if (this.locationSwitcherMode === 'services') {
                this.locationSwitcherTarget.innerHTML = this.serviceFilterOptionsMarkup();
                return;
            }

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

    serviceFilterOptionsMarkup() {
        const options = [
            ['all', 'Todo', 'Muestra todos los locales visibles.'],
            ['dine_in', 'Comer en el lugar', 'Locales para sentarte o consumir en sitio.'],
            ['delivery', 'Servicio a domicilio', 'Locales con envío o contacto para entrega.'],
            ['takeaway', 'Para llevar', 'Locales con pedido para recoger.'],
        ];

        return options.map(([key, label, description]) => `
            <button
                type="button"
                class="mobile-map-app__location-item ${this.activeServiceFilter === key ? 'is-active' : ''}"
                data-action="click->map-shell#selectServiceFilter"
                data-service-filter="${this.escapeHtml(key)}"
            >
                <strong>${this.escapeHtml(label)}</strong>
                <span>${this.escapeHtml(description)}</span>
            </button>
        `).join('');
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
        this.closeMenu();

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
        if (hasServerCoordinates) {
            const initialLabel = this.hasInitialLocationLabelValue ? this.initialLocationLabelValue : '';
            this.currentLocationLabel = initialLabel || 'Ubicación actual';
            this.updateHeroLocation(this.currentLocationLabel, { persist: false });
            return;
        }

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
            this.updateHeroLocation(this.currentLocationLabel, { persist: false });
            return;
        }

        this.persistPrimarySavedAddressContext();
    }

    persistPrimarySavedAddressContext() {
        if (!this.authenticatedValue || !Array.isArray(this.savedAddresses) || this.savedAddresses.length === 0) {
            return;
        }

        const address = this.savedAddresses.find((item) => item.is_primary && item.latitude && item.longitude)
            ?? this.savedAddresses.find((item) => item.latitude && item.longitude)
            ?? null;

        if (!address) {
            return;
        }

        this.latValue = Number(address.latitude);
        this.lngValue = Number(address.longitude);
        this.currentLocationLabel = address.label || 'Mi ubi guardada';
        this.updateHeroLocation(this.currentLocationLabel, { persist: true });
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

    favoriteButtonMarkup(location) {
        const favoriteKey = this.favoriteKeyForLocation(location);
        if (favoriteKey === '') {
            return '';
        }

        const isFavorite = this.isLocationFavorite(location);
        const locationId = Number.parseInt(String(location.location_id ?? ''), 10);

        return `
            <button
                type="button"
                class="mobile-map-card__heart ${isFavorite ? 'is-active' : ''}"
                data-action="map-shell#toggleFavorite"
                data-favorite-key="${this.escapeHtml(favoriteKey)}"
                data-location-key="${this.escapeHtml(this.locationKey(location))}"
                ${Number.isInteger(locationId) ? `data-location-id="${locationId}"` : ''}
                aria-label="${isFavorite ? 'Quitar favorito' : 'Guardar favorito'}"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s-7-4.4-9.2-8.5C.9 9.1 2.3 5 6.3 5c2.2 0 3.6 1.3 4.4 2.4C11.5 6.3 12.9 5 15.1 5c4 0 5.4 4.1 3.5 7.5C16.4 16.6 12 21 12 21Z"></path>
                </svg>
            </button>
        `;
    }

    canFavorite(location) {
        return this.favoriteKeyForLocation(location) !== '';
    }

    acceptCookiesFromProfile() {
        this.storeCookieConsent('all');
        window.dispatchEvent(new CustomEvent('mi-monchis:analytics-consent-granted'));
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

        const analytics = consent.scope === 'all' || consent.categories?.analytics === true;
        this.cookieConsentStatusTarget.textContent = analytics
            ? 'Preferencias activas: esenciales y analítica.'
            : 'Preferencias activas: solo esenciales.';
    }

    storeCookieConsent(scope) {
        try {
            const analytics = scope === 'all';
            window.localStorage.setItem('mi_monchis_cookie_consent', JSON.stringify({
                scope: analytics ? 'all' : 'custom',
                categories: {
                    essential: true,
                    analytics,
                },
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

    humanizeLegalSlug(slug) {
        const labels = {
            'terminos-publico': 'Términos público',
            'aviso-privacidad': 'Aviso de privacidad',
            cookies: 'Cookies',
        };

        return labels[slug] ?? String(slug ?? 'Documento legal');
    }

    formatDateTime(value) {
        if (!value) {
            return 'Sin fecha';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
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
            if (!message) {
                this.canvasNoteTarget.innerHTML = '';
                return;
            }

            this.canvasNoteTarget.innerHTML = `
                <span class="map-shell__canvas-loader" aria-hidden="true"></span>
                <span>${this.escapeHtml(message)}</span>
            `;
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
            return this.compactAddressLabel(location.short_address);
        }

        if (location.short_address) {
            return this.compactAddressLabel(location.short_address);
        }

        if (location.merchant_name) {
            return location.merchant_name;
        }

        return 'Direccion pendiente';
    }

    compactAddressLabel(address) {
        const fallback = 'Direccion pendiente';
        let value = String(address || '').trim();

        if (!value) {
            return fallback;
        }

        value = value
            .replace(/\bC\.?\s*P\.?\s*\d{5}\b/gi, '')
            .replace(/,\s*\d{5}\b.*$/u, '')
            .replace(/\b\d{5}\b.*$/u, '')
            .replace(/\s*,\s*(Mexico|México)$/iu, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/\s*,\s*$/u, '')
            .trim();

        return value || fallback;
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

    locationBusinessStatus(location) {
        return typeof location.business_status === 'string' ? location.business_status : '';
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

    locationDescription(location, reviewSnippet = '') {
        const description = location.description
            || location.short_description
            || location.editorial_summary
            || location.summary
            || reviewSnippet
            || '';

        if (String(description).trim() !== '') {
            return String(description).trim();
        }

        const categoryKey = this.locationCategoryKey(location);
        const categoryLabel = categoryKey !== 'all' ? this.categoryDisplayName(categoryKey).toLowerCase() : 'antojitos';
        const name = location.location_name ?? location.merchant_name ?? 'este local';
        return `${name} forma parte de los lugares cercanos para explorar ${categoryLabel}. Revisa su ubicación, guarda el favorito o pide por WhatsApp cuando esté disponible.`;
    }

    detailGalleryMarkup(location) {
        const urls = [
            location.photo_url,
            location.category_cover_photo_url,
            location.category_default_photo_url,
        ].filter((url, index, source) => url && source.indexOf(url) === index);

        if (urls.length === 0) {
            return '';
        }

        return `
            <div class="mobile-map-app__detail-gallery" aria-label="Vista rápida">
                ${urls.slice(0, 3).map((url) => `
                    <div style="background-image:url('${this.escapeHtml(url)}')"></div>
                `).join('')}
            </div>
        `;
    }

    buildProfileUrl(location) {
        if (location.public_profile_url) {
            return this.profileUrlWithReturnContext(String(location.public_profile_url), location);
        }

        if (location.profile_url) {
            return this.profileUrlWithReturnContext(String(location.profile_url), location);
        }

        const locationRef = location.location_slug || location.location_id;
        if (locationRef) {
            const url = new URL(`/l/${encodeURIComponent(String(locationRef))}`, window.location.origin);
            url.searchParams.set('sheet_location', this.locationKey(location));
            if (Number.isFinite(this.latValue) && Number.isFinite(this.lngValue)) {
                url.searchParams.set('lat', String(this.latValue));
                url.searchParams.set('lng', String(this.lngValue));
            }

            if (location.source_type === 'google_places') {
                if (location.lat && location.lng) {
                    url.searchParams.set('lat', String(location.lat));
                    url.searchParams.set('lng', String(location.lng));
                }

                const categoryKey = this.locationCategoryKey(location);
                if (categoryKey !== 'all') {
                    url.searchParams.set('category', categoryKey);
                }
            }

            return `${url.pathname}${url.search}`;
        }

        return null;
    }

    profileUrlWithReturnContext(profileUrl, location) {
        const url = new URL(profileUrl, window.location.origin);
        url.searchParams.set('sheet_location', this.locationKey(location));

        if (Number.isFinite(this.latValue) && Number.isFinite(this.lngValue)) {
            url.searchParams.set('lat', String(this.latValue));
            url.searchParams.set('lng', String(this.lngValue));
        }

        if (location.source_type === 'google_places') {
            if (location.lat && location.lng) {
                url.searchParams.set('lat', String(location.lat));
                url.searchParams.set('lng', String(location.lng));
            }

            const categoryKey = this.locationCategoryKey(location);
            if (categoryKey !== 'all') {
                url.searchParams.set('category', categoryKey);
            }
        }

        return `${url.pathname}${url.search}`;
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

    ownReviewDraftForLocation(location) {
        const sourceType = this.normalizeFavoriteSource(location.source_type);
        const locationId = Number.parseInt(String(location.location_id ?? ''), 10);

        return {
            source_type: sourceType,
            location_id: sourceType === 'canonical' && Number.isInteger(locationId) ? locationId : null,
            external_source_key: sourceType === 'google_places' ? (location.external_source_key ?? location.place_id ?? null) : null,
            review_key: sourceType === 'google_places'
                ? this.favoriteKeyForSource(sourceType, location.external_source_key ?? location.place_id ?? '')
                : this.favoriteKeyForSource(sourceType, Number.isInteger(locationId) ? String(locationId) : ''),
            rating_value: 5,
            body: '',
            media: [],
            status: 'draft',
        };
    }

    ownReviewEntrypointMarkup(location) {
        const draft = this.ownReviewDraftForLocation(location);
        const entityRef = draft.location_id ?? draft.external_source_key ?? this.locationKey(location);
        const subjectAttrs = `
            data-source-type="${this.escapeHtml(draft.source_type)}"
            data-location-id="${this.escapeHtml(String(draft.location_id ?? ''))}"
            data-external-source-key="${this.escapeHtml(String(draft.external_source_key ?? ''))}"
            data-review-key="${this.escapeHtml(draft.review_key)}"
        `;
        const formMarkup = this.authenticatedValue ? `
            <form class="mobile-map-app__own-review-form" data-action="submit->map-shell#submitOwnReview" ${subjectAttrs}>
                <div class="mobile-map-app__own-review-stars" role="radiogroup" aria-label="Calificación Mi Monchis">
                    ${[1, 2, 3, 4, 5].map((rating) => `
                        <label>
                            <input type="radio" name="rating_value" value="${rating}" ${rating === 5 ? 'checked' : ''}>
                            <span>${rating}</span>
                        </label>
                    `).join('')}
                </div>
                <label class="mobile-map-app__own-review-field">
                    <span>Comentario</span>
                    <textarea name="review_body" rows="3" maxlength="1800" placeholder="¿Qué probaste y cómo estuvo?"></textarea>
                </label>
                <label class="mobile-map-app__own-review-field">
                    <span>Foto</span>
                    <input type="url" name="media_url" placeholder="https://...">
                </label>
                <button type="submit">Publicar reseña</button>
                <p class="mobile-map-app__own-review-status" data-own-review-form-status></p>
            </form>
        ` : `
            <button
                type="button"
                data-action="click->map-shell#startOwnReview"
                data-source-type="${this.escapeHtml(draft.source_type)}"
                data-entity-ref="${this.escapeHtml(String(entityRef ?? ''))}"
            >
                Iniciar sesión
            </button>
        `;

        return `
            <section class="mobile-map-app__own-review" ${subjectAttrs}>
                <header>
                    <small>Reseñas Mi Monchis</small>
                    <strong>Tu experiencia, separada del rating de Google</strong>
                    <p>Las reseñas propias pasan por moderación antes de publicarse para toda la comunidad.</p>
                </header>
                ${formMarkup}
                <div class="mobile-map-app__own-review-list" data-own-review-list data-review-key="${this.escapeHtml(draft.review_key)}">
                    <p>Cargando reseñas Mi Monchis...</p>
                </div>
            </section>
        `;
    }

    startOwnReview(event) {
        const sourceType = event.currentTarget.dataset.sourceType ?? 'canonical';
        const entityRef = event.currentTarget.dataset.entityRef ?? '';

        if (!this.authenticatedValue) {
            this.setStatus('Inicia sesión para dejar una reseña Mi Monchis.');
            this.openAuthModal({
                title: 'Inicia sesión para reseñar',
                copy: 'Las reseñas propias de Mi Monchis quedarán ligadas a tu cuenta y pasarán por moderación.',
            });
            return;
        }

        this.logInteraction('public_own_review_started', 'location', Number(entityRef) || null, {
            source_type: sourceType,
            entity_ref: entityRef,
            status: 'login_gate',
        });
    }

    async submitOwnReview(event) {
        event.preventDefault();

        if (!this.requireAuthentication({
                title: 'Inicia sesión para reseñar',
                copy: 'Las reseñas propias de Mi Monchis quedan ligadas a tu cuenta y pasan por moderación.',
                status: 'Inicia sesión para reseñar.',
            })) {
            return;
        }

        if (!this.hasReviewsUrlValue || this.reviewsUrlValue === '') {
            this.setStatus('El endpoint de reseñas no está disponible.');
            return;
        }

        const form = event.currentTarget;
        const status = form.querySelector('[data-own-review-form-status]');
        const submitButton = form.querySelector('button[type="submit"]');
        const payload = this.reviewSubjectPayloadFromDataset(form.dataset);
        const ratingInput = form.querySelector('input[name="rating_value"]:checked');
        payload.rating_value = Number.parseInt(String(ratingInput?.value ?? '0'), 10);
        payload.review_body = form.querySelector('[name="review_body"]')?.value.trim() ?? '';
        const mediaUrl = form.querySelector('[name="media_url"]')?.value.trim() ?? '';

        if (!Number.isInteger(payload.rating_value) || payload.rating_value < 1 || payload.rating_value > 5) {
            status.textContent = 'Elige una calificación.';
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
        }
        status.textContent = 'Publicando...';

        try {
            const response = await this.requestJson(this.reviewsUrlValue, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (mediaUrl && response.data?.id) {
                await this.requestJson(`${this.reviewsUrlValue}/${response.data.id}/media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ media_type: 'image', storage_url: mediaUrl }),
                });
            }

            form.reset();
            const defaultRating = form.querySelector('input[name="rating_value"][value="5"]');
            if (defaultRating) {
                defaultRating.checked = true;
            }
            status.textContent = 'Reseña enviada a revisión.';
            this.setStatus('Reseña Mi Monchis enviada a revisión.');
            await this.loadOwnReviewsForSubject(form.dataset);
            this.logInteraction('public_own_review_submitted', 'location', payload.location_id ?? null, {
                source_type: payload.source_type,
                review_status: response.data?.status ?? 'pending_review',
                has_media: mediaUrl !== '',
            });
        } catch (error) {
            status.textContent = error.message;
            this.setStatus(error.message);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    }

    reviewSubjectPayloadFromDataset(dataset) {
        const sourceType = this.normalizeFavoriteSource(dataset.sourceType ?? 'canonical');
        const locationId = Number.parseInt(String(dataset.locationId ?? ''), 10);

        return {
            source_type: sourceType,
            location_id: sourceType === 'canonical' && Number.isInteger(locationId) ? locationId : null,
            external_source_key: sourceType === 'google_places' ? (dataset.externalSourceKey || null) : null,
        };
    }

    async loadOwnReviewsForSubject(dataset) {
        const list = [...(this.detailSheetBodyTarget?.querySelectorAll('[data-own-review-list]') ?? [])]
            .find((candidate) => candidate.dataset.reviewKey === (dataset.reviewKey ?? ''));
        if (!list || !this.hasReviewsUrlValue || this.reviewsUrlValue === '') {
            return;
        }

        list.innerHTML = '<p>Cargando reseñas Mi Monchis...</p>';
        const payload = this.reviewSubjectPayloadFromDataset(dataset);
        const url = new URL(this.reviewsUrlValue, window.location.origin);
        url.searchParams.set('source_type', payload.source_type);
        if (payload.location_id !== null) {
            url.searchParams.set('location_id', String(payload.location_id));
        }
        if (payload.external_source_key) {
            url.searchParams.set('external_source_key', payload.external_source_key);
        }

        try {
            const response = await this.requestJson(url.toString(), { method: 'GET' });
            const reviews = Array.isArray(response.data) ? response.data : [];
            list.innerHTML = this.ownReviewsListMarkup(reviews);
        } catch (error) {
            list.innerHTML = `<p class="is-error">${this.escapeHtml(error.message)}</p>`;
        }
    }

    ownReviewsListMarkup(reviews) {
        if (reviews.length === 0) {
            return '<p>Aún no hay reseñas Mi Monchis para este lugar.</p>';
        }

        return reviews.map((review) => {
            const status = review.status === 'published' ? 'Publicada' : 'En revisión';
            const media = Array.isArray(review.media) ? review.media.slice(0, 3) : [];

            return `
                <article class="mobile-map-app__own-review-item">
                    <div>
                        <strong>${this.escapeHtml(review.author?.display_name ?? 'Usuario Mi Monchis')}</strong>
                        <span>${this.escapeHtml(this.starRatingLabel(review.rating_value))}</span>
                        <small>${this.escapeHtml(status)}</small>
                    </div>
                    ${review.review_body ? `<p>${this.escapeHtml(review.review_body)}</p>` : ''}
                    ${media.length > 0 ? `
                        <div class="mobile-map-app__own-review-media">
                            ${media.map((item) => {
                                const url = item.thumbnail_url || item.storage_url || '';
                                return url ? `<img src="${this.escapeHtml(url)}" alt="" loading="lazy">` : '';
                            }).join('')}
                        </div>
                    ` : ''}
                </article>
            `;
        }).join('');
    }

    starRatingLabel(value) {
        const rating = Math.max(0, Math.min(5, Number.parseInt(String(value ?? '0'), 10) || 0));
        return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
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
        const favoriteKey = this.favoriteKeyForLocation(location);
        const isFavorite = this.isLocationFavorite(location);
        const ratingLabel = this.reviewsLabel(location);
        const hoursSummary = this.openingHoursSummary(location);
        const reviewSnippet = this.reviewSnippet(location);
        const detailKey = this.escapeHtml(this.locationKey(location));
        const photoUrl = this.locationVisualPhotoUrl(location);
        const heroStyle = photoUrl ? `style="background-image:url('${this.escapeHtml(photoUrl)}')"` : '';
        const distanceLabel = this.formatDistance(location.distance_meters) || 'Cerca de ti';
        const description = this.locationDescription(location, reviewSnippet);
        const profileUrl = this.buildProfileUrl(location);
        const profileActionMarkup = profileUrl
            ? `<a class="mobile-map-app__detail-action-primary mobile-map-app__detail-action-primary--profile" href="${this.escapeHtml(profileUrl)}" data-turbo="false">Ver perfil completo</a>`
            : (claimUrl ? `<a class="mobile-map-app__detail-action-primary mobile-map-app__detail-action-primary--profile" href="${this.escapeHtml(claimUrl)}" data-action="click->map-shell#trackExternalAction" data-event-name="public_claim_started" data-entity-id="${this.escapeHtml(String(location.location_id ?? ''))}" data-location-key="${detailKey}">Crear perfil del local</a>` : '');
        const claimFootnoteMarkup = claimUrl
            ? `<p class="mobile-map-app__detail-claim-note">¿Eres dueño del establecimiento? <a href="${this.escapeHtml(claimUrl)}" data-action="click->map-shell#trackExternalAction" data-event-name="public_claim_started" data-entity-id="${this.escapeHtml(String(location.location_id ?? ''))}" data-location-key="${detailKey}">Reclámalo</a>.</p>`
            : '';
        const ownReviewMarkup = this.ownReviewEntrypointMarkup(location);

        this.detailSheetBodyTarget.innerHTML = `
            <div class="mobile-map-app__detail-grabber" aria-hidden="true"></div>
            <div class="mobile-map-app__detail-hero mobile-map-app__detail-hero--${this.mediaTone(location)} ${photoUrl ? 'has-photo' : ''}" ${heroStyle}>
                <div class="mobile-map-app__detail-overlay-actions">
                    <button type="button" class="mobile-map-app__detail-float-button" data-action="click->map-shell#closeDetailSheet" aria-label="Cerrar detalle">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 6 18 18" />
                            <path d="M18 6 6 18" />
                        </svg>
                    </button>
                    ${canFavorite ? `
                        <button
                            type="button"
                            class="mobile-map-app__detail-float-button mobile-map-app__detail-float-button--favorite ${isFavorite ? 'is-active' : ''}"
                            data-action="click->map-shell#toggleFavoriteFromSheet"
                            data-favorite-key="${this.escapeHtml(favoriteKey)}"
                            data-location-key="${detailKey}"
                            aria-label="${isFavorite ? 'Quitar favorito' : 'Guardar favorito'}"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 21s-7-4.4-9.2-8.5C.9 9.1 2.3 5 6.3 5c2.2 0 3.6 1.3 4.4 2.4C11.5 6.3 12.9 5 15.1 5c4 0 5.4 4.1 3.5 7.5C16.4 16.6 12 21 12 21Z" />
                            </svg>
                        </button>
                    ` : ''}
                </div>
                <span class="mobile-map-app__detail-source ${this.sourceBadgeClass(location)}">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m9 12 2 2 4-5" />
                        <path d="M12 3 4.5 6.3v5.6c0 4.6 3.2 7.7 7.5 9.1 4.3-1.4 7.5-4.5 7.5-9.1V6.3L12 3Z" />
                    </svg>
                    ${this.escapeHtml(this.sourceTypeLabel(location.source_type))}
                </span>
            </div>
            <div class="mobile-map-app__detail-copy">
                <div class="mobile-map-app__detail-head">
                    <div>
                        <h3>${this.escapeHtml(location.location_name ?? 'Local sin nombre')}</h3>
                        <div class="mobile-map-app__detail-rating-row">
                            <span class="mobile-map-app__detail-rating">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 17.1 6.8 19.8l1-5.8-4.2-4.1 5.8-.8L12 3.8Z" /></svg>
                                ${this.escapeHtml(ratingLabel)}
                            </span>
                            <span>${this.escapeHtml(distanceLabel)}</span>
                        </div>
                    </div>
                    <span class="mobile-map-app__detail-status ${this.publicationStatusClass(location)}">${this.escapeHtml(this.publicationStatusLabel(location))}</span>
                </div>
                ${categoryLabel ? `
                    <div class="mobile-map-app__detail-category">
                        <span style="background:${this.escapeHtml(categoryColor)};"></span>
                        <div>
                            <small>Categoría</small>
                            <strong>${this.escapeHtml(categoryLabel)}</strong>
                        </div>
                    </div>
                ` : ''}
                <div class="mobile-map-app__detail-meta">
                    <span>${this.escapeHtml(location.short_address ?? 'Dirección pendiente')}</span>
                </div>
                ${this.locationIsJoyita(location) ? `<div class="mobile-map-app__detail-joyita">${this.escapeHtml(this.joyitaDetailLabel(location))}</div>` : ''}
                ${hoursSummary ? `<p class="mobile-map-app__detail-note">${this.escapeHtml(hoursSummary)}</p>` : ''}
                ${this.detailGalleryMarkup(location)}
                <section class="mobile-map-app__detail-section">
                    <h4>Sobre nosotros</h4>
                    <p>${this.escapeHtml(description)}</p>
                </section>
                ${ownReviewMarkup}
                <div class="mobile-map-app__detail-actions mobile-map-app__detail-actions--primary">
                    <button type="button" class="mobile-map-app__detail-action-primary mobile-map-app__detail-action-primary--route" data-action="click->map-shell#startInternalRoute" data-location-key="${detailKey}">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                        Cómo llegar
                    </button>
                    ${profileActionMarkup}
                </div>
                ${whatsappUrl ? `<a class="mobile-map-app__detail-action-primary mobile-map-app__detail-action-primary--whatsapp" href="${this.escapeHtml(whatsappUrl)}" target="_blank" rel="noreferrer" data-action="click->map-shell#trackExternalAction" data-event-name="public_whatsapp_clicked" data-entity-id="${this.escapeHtml(String(location.location_id ?? ''))}" data-location-key="${detailKey}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.6a8 8 0 0 1-11.8 7l-3.2.9.9-3.1A8 8 0 1 1 20 11.6Z" /><path d="M9.4 8.8c.2 2.7 2.2 4.7 4.9 5" /></svg>
                    Pedir por WhatsApp
                </a>` : `<button type="button" class="mobile-map-app__detail-action-primary mobile-map-app__detail-action-primary--whatsapp" disabled>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.6a8 8 0 0 1-11.8 7l-3.2.9.9-3.1A8 8 0 1 1 20 11.6Z" /><path d="M9.4 8.8c.2 2.7 2.2 4.7 4.9 5" /></svg>
                    WhatsApp pendiente
                </button>`}
                ${claimFootnoteMarkup}
            </div>
        `;

        this.detailSheetTarget.classList.remove('is-hidden');
        this.detailSheetTarget.classList.add('is-visible');
        const reviewSection = this.detailSheetBodyTarget.querySelector('.mobile-map-app__own-review');
        if (reviewSection?.dataset) {
            this.loadOwnReviewsForSubject(reviewSection.dataset);
        }
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

        this.trackGoogleAnalyticsEvent(eventName, entityType, entityId, metadata);

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

    trackGoogleAnalyticsEvent(eventName, entityType, entityId = null, metadata = {}) {
        if (typeof window.gtag !== 'function') {
            return;
        }

        const params = {
            entity_type: entityType,
        };

        if (entityId !== null && !Number.isNaN(entityId)) {
            params.entity_id = entityId;
        }

        ['source_type', 'place_id', 'location_name', 'service', 'section'].forEach((key) => {
            if (metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '') {
                params[key] = String(metadata[key]).slice(0, 120);
            }
        });

        window.gtag('event', eventName, params);
    }

    analyticsConsentGranted() {
        const consent = this.readCookieConsent();

        return consent?.scope === 'all' || consent?.categories?.analytics === true;
    }
}
