import { startStimulusApp } from '@symfony/stimulus-bundle';
import CookieConsentController from './controllers/cookie_consent_controller.js';
import MapShellController from './controllers/map_shell_controller.js';

const app = startStimulusApp();
app.register('cookie-consent', CookieConsentController);
app.register('map-shell', MapShellController);
