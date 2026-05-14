import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = ['panel'];

    connect() {
        if (this.readConsent()) {
            this.element.classList.add('is-hidden');
            return;
        }

        this.element.classList.remove('is-hidden');
    }

    acceptAll() {
        this.storeConsent('all');
        this.hide();
    }

    rejectOptional() {
        this.storeConsent('essential');
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

    storeConsent(scope) {
        try {
            window.localStorage.setItem('mi_monchis_cookie_consent', JSON.stringify({
                scope,
                version: 'v1.0',
                decided_at: new Date().toISOString(),
            }));
        } catch (error) {
            // El banner no debe bloquear la navegación si el navegador bloquea storage.
        }
    }
}
