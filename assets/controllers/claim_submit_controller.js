import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = ["submitButton", "statusMessage", "csrfToken"];
    
    connect() {
        this.state = 'ready';
        this.updateUI();
    }

    async submit(event) {
        event.preventDefault();

        if (this.state === 'submitting' || this.state === 'confirming_result' || this.state === 'submitted') {
            return;
        }

        this.transitionTo('submitting');

        try {
            const response = await fetch('/claim/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': this.csrfTokenTarget.value,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ confirm: true })
            });

            this.transitionTo('confirming_result');

            const data = await response.json();

            if (response.ok) {
                this.transitionTo('submitted');
                window.location.href = data.redirect_url;
            } else {
                if (response.status === 409 && data.status === 'already_submitted') {
                    this.transitionTo('already_submitted');
                    window.location.href = data.redirect_url;
                } else if (response.status === 422) {
                    this.transitionTo('validation_error');
                    this.showError(data.error || 'Información incompleta.');
                } else if (response.status === 401) {
                    this.transitionTo('session_expired');
                    this.showError('Tu sesión ha expirado.');
                } else {
                    this.transitionTo('temporary_error');
                    this.showError('Ocurrió un error. Inténtalo de nuevo.');
                }
            }
        } catch (err) {
            this.transitionTo('temporary_error');
            this.showError('Error de conexión. Inténtalo de nuevo.');
        }
    }

    transitionTo(newState) {
        this.state = newState;
        this.updateUI();
    }

    updateUI() {
        if (!this.hasSubmitButtonTarget) return;

        this.submitButtonTarget.disabled = ['submitting', 'confirming_result', 'submitted', 'already_submitted'].includes(this.state);
        
        if (this.state === 'submitting') {
            this.submitButtonTarget.textContent = 'Enviando...';
        } else if (this.state === 'confirming_result') {
            this.submitButtonTarget.textContent = 'Confirmando...';
        } else if (this.state === 'ready' || this.state === 'validation_error' || this.state === 'temporary_error') {
            this.submitButtonTarget.textContent = 'Enviar Solicitud';
        }
    }

    showError(msg) {
        if (this.hasStatusMessageTarget) {
            this.statusMessageTarget.textContent = msg;
            this.statusMessageTarget.classList.remove('hidden');
        }
    }
}
