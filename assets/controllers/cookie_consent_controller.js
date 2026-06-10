import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = ['panel', 'analyticsInput'];

    connect() {
        if (this.readConsent()) {
            this.element.classList.add('is-hidden');
            return;
        }

        this.element.classList.remove('is-hidden');
    }

    acceptAll() {
        this.storeConsent({ analytics: true });
        window.dispatchEvent(new CustomEvent('mi-monchis:analytics-consent-granted'));
        this.hide();
    }

    rejectOptional() {
        this.storeConsent({ analytics: false });
        this.hide();
    }

    savePreferences() {
        const analytics = this.hasAnalyticsInputTarget && this.analyticsInputTarget.checked;
        this.storeConsent({ analytics });
        if (analytics) {
            window.dispatchEvent(new CustomEvent('mi-monchis:analytics-consent-granted'));
        }
        this.hide();
    }

    hide() {
        this.element.classList.add('is-hidden');
    }

    readConsent() {
        try {
            return window.localStorage.getItem('mi_monchis_cookie_consent');
        } catch (error) {
            return null;
        }
    }

    storeConsent(categories) {
        try {
            window.localStorage.setItem('mi_monchis_cookie_consent', JSON.stringify({
                scope: categories.analytics ? 'all' : 'custom',
                categories: {
                    essential: true,
                    analytics: categories.analytics,
                },
                version: 'v1.0',
                decided_at: new Date().toISOString(),
            }));
        } catch (error) {
            // El banner no debe bloquear la navegación si el navegador bloquea storage.
        }
    }
}
