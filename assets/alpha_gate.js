import { Application } from '@hotwired/stimulus';
import CookieConsentController from './controllers/cookie_consent_controller.js';
import './styles/app.css';

const app = Application.start();
app.register('cookie-consent', CookieConsentController);

const typewriter = document.querySelector('[data-alpha-typewriter]');

if (typewriter) {
    const message = typewriter.dataset.alphaTypewriter ?? '';
    let index = 0;

    typewriter.classList.add('is-typing');
    document.querySelectorAll('[data-alpha-present="1"], [data-alpha-present="2"]').forEach((element, position) => {
        window.setTimeout(() => {
            element.classList.add('is-visible');
        }, position * 120);
    });

    const revealPresentingElements = () => {
        document.querySelectorAll('[data-alpha-present="3"], [data-alpha-present="4"], [data-alpha-present="5"], [data-alpha-present="6"]').forEach((element, position) => {
            window.setTimeout(() => {
                element.classList.add('is-visible');
            }, position * 95);
        });
    };

    const type = () => {
        if (index < message.length) {
            typewriter.textContent += message.charAt(index);
            index += 1;
            window.setTimeout(type, 38);
            return;
        }

        window.setTimeout(() => {
            typewriter.classList.remove('is-typing');
            revealPresentingElements();
        }, 180);
    };

    window.setTimeout(type, 520);
} else {
    document.querySelectorAll('[data-alpha-present]').forEach((element) => {
        element.classList.add('is-visible');
    });
}
