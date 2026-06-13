import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = [
        'step',
        'segment',
        'counter',
        'title',
        'actions',
        'next',
        'password',
        'passwordToggle',
        'methodChoice',
    ];

    connect() {
        this.currentStep = 0;
        this.showStep(0);
    }

    startEmailRegistration() {
        this.element.classList.add('is-form-active');
        this.showStep(0);
    }

    previous() {
        this.showStep(this.currentStep - 1);
    }

    next(event) {
        if (this.currentStep === this.stepTargets.length - 1) {
            return;
        }

        event.preventDefault();
        if (this.validateCurrentStep()) {
            this.showStep(this.currentStep + 1);
        }
    }

    guardSubmit(event) {
        if (!this.validateCurrentStep()) {
            event.preventDefault();
        }
    }

    togglePasswordVisibility() {
        if (!this.hasPasswordTarget) {
            return;
        }

        this.passwordTarget.type = this.passwordTarget.type === 'password' ? 'text' : 'password';
        if (this.hasPasswordToggleTarget) {
            this.passwordToggleTarget.setAttribute(
                'aria-label',
                this.passwordTarget.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña'
            );
        }
    }

    showStep(index) {
        this.currentStep = Math.max(0, Math.min(index, this.stepTargets.length - 1));

        this.stepTargets.forEach((step, stepIndex) => {
            step.classList.toggle('is-active', stepIndex === this.currentStep);
        });

        this.segmentTargets.forEach((segment, segmentIndex) => {
            segment.classList.toggle('is-active', segmentIndex <= this.currentStep);
        });

        if (this.hasCounterTarget) {
            this.counterTarget.textContent = `Paso ${this.currentStep + 1} de ${this.stepTargets.length}`;
        }

        if (this.hasTitleTarget) {
            this.titleTarget.textContent = this.stepTargets[this.currentStep]?.dataset.stepTitle ?? '';
        }

        if (this.hasActionsTarget) {
            this.actionsTarget.classList.toggle('has-previous', this.currentStep > 0);
        }

        if (this.hasNextTarget) {
            this.nextTarget.textContent = this.currentStep === this.stepTargets.length - 1 ? 'Crear cuenta' : 'Continuar >';
            this.nextTarget.type = this.currentStep === this.stepTargets.length - 1 ? 'submit' : 'button';
        }
    }

    validateCurrentStep() {
        const currentStep = this.stepTargets[this.currentStep];
        if (!currentStep) {
            return true;
        }

        return Array.from(currentStep.querySelectorAll('input[required]')).every((field) => {
            if (typeof field.reportValidity === 'function') {
                return field.reportValidity();
            }

            return String(field.value ?? '').trim() !== '';
        });
    }
}
