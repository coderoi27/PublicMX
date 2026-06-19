import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = [
        'statusContainer', 'statusText', 'progressBar', 'errorMessage',
        'retryButton', 'cancelButton', 'continueButton', 'recorderContainer'
    ];
    
    static values = {
        prepareUrl: String,
        completeUrl: String,
        maxSizeBytes: Number
    };

    connect() {
        this.currentFile = null;
        this.currentXhr = null;
        this.abortController = null;
        
        // El CSRF token está en el wizard principal
        const wizard = document.getElementById('claim-wizard');
        this.csrfToken = wizard ? wizard.dataset.csrfToken : '';
    }

    disconnect() {
        this.cleanupTransientData();
    }

    cleanupTransientData() {
        if (this.currentXhr) {
            this.currentXhr.abort();
            this.currentXhr = null;
        }
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    receiveFile(event) {
        // Evento lanzado desde media_recorder_controller
        this.currentFile = event.detail.file;
        
        // Mostramos nuestro UI de subida y ocultamos el recorder
        this.recorderContainerTarget.hidden = true;
        this.statusContainerTarget.hidden = false;
        
        this.startUploadFlow();
    }

    async startUploadFlow() {
        this.hideButtons();
        this.progressBarTarget.value = 0;
        this.errorMessageTarget.textContent = '';
        
        // 1. Local Validation (validating)
        this.setStatus('Validando archivo...', 0);
        if (!this.currentFile) {
            this.showError('No se encontró ningún archivo.');
            return;
        }

        if (this.currentFile.size === 0) {
            this.showError('El archivo está vacío.');
            return;
        }

        if (this.currentFile.size > this.maxSizeBytesValue) {
            const mb = Math.round(this.maxSizeBytesValue / 1024 / 1024);
            this.showError(`El archivo excede el tamaño máximo permitido de ${mb} MB.`);
            return;
        }

        // 2. Prepare Upload (preparing_upload)
        this.setStatus('Preparando subida segura...', 5);
        this.abortController = new AbortController();
        
        let prepareData;
        try {
            const response = await fetch(this.prepareUrlValue, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': this.csrfToken
                },
                body: JSON.stringify({
                    file_name: this.currentFile.name,
                    mime_type: this.currentFile.type,
                    size_bytes: this.currentFile.size
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Error al preparar la carga.');
            }

            prepareData = await response.json();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showError(error.message);
            }
            return;
        }

        const { upload_url, evidence_id } = prepareData;

        // 3. Upload to R2 (uploading)
        this.setStatus('Subiendo evidencia...', 10);
        this.currentXhr = new XMLHttpRequest();
        this.currentXhr.open('PUT', upload_url);
        
        // Importante: R2 no acepta credenciales ni cookies cruzadas.
        this.currentXhr.withCredentials = false;
        
        // Solo el header autorizado en la firma
        this.currentXhr.setRequestHeader('Content-Type', this.currentFile.type);

        this.currentXhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const progress = Math.round((event.loaded / event.total) * 100);
                this.progressBarTarget.value = progress;
                
                if (progress === 100) {
                    // El body ya subió, pero el server todavía no contesta 200 HTTP.
                    this.setStatus('Procesando almacenamiento...', 100);
                } else {
                    this.setStatus(`Subiendo evidencia... ${progress}%`, progress);
                }
            }
        });

        this.cancelButtonTarget.hidden = false;

        this.currentXhr.onload = async () => {
            this.cancelButtonTarget.hidden = true;
            
            if (this.currentXhr.status >= 200 && this.currentXhr.status < 300) {
                // 4. Confirm Upload (confirming_upload)
                this.setStatus('Verificando archivo con el servidor...', 100);
                
                const eTag = this.currentXhr.getResponseHeader('ETag') || '';
                
                try {
                    const completeResponse = await fetch(this.completeUrlValue, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrfToken
                        },
                        body: JSON.stringify({
                            evidence_id: evidence_id,
                            etag: eTag
                        }),
                        signal: this.abortController.signal
                    });

                    if (!completeResponse.ok) {
                        throw new Error('El servidor rechazó la evidencia verificada.');
                    }

                    // 5. Uploaded (éxito)
                    this.setStatus('¡Evidencia subida correctamente!', 100);
                    this.continueButtonTarget.hidden = false;
                    
                    // Ya no necesitamos el archivo en memoria local
                    this.currentFile = null;

                } catch (err) {
                    if (err.name !== 'AbortError') {
                        this.showError(err.message);
                    }
                }

            } else {
                this.showError('Fallo al subir el archivo a nuestro almacenamiento.');
            }
        };

        this.currentXhr.onerror = () => {
            this.cancelButtonTarget.hidden = true;
            this.showError('Error de red al intentar subir el archivo.');
        };

        this.currentXhr.onabort = () => {
            this.cancelButtonTarget.hidden = true;
            this.setStatus('Subida cancelada.', 0);
            this.retryButtonTarget.hidden = false;
        };

        this.currentXhr.send(this.currentFile);
    }

    retry() {
        this.cleanupTransientData();
        this.startUploadFlow();
    }

    cancel() {
        this.cleanupTransientData();
        // Si el usuario cancela explicitamente, limpiamos el archivo local y permitimos grabar otro
        this.currentFile = null;
        this.statusContainerTarget.hidden = true;
        this.recorderContainerTarget.hidden = false;
        
        // Reseteamos el UI de MediaRecorder (llamando a la función reset si la exponemos, 
        // pero podemos emitir un custom event para que él se reinicie)
        const event = new CustomEvent('claim:evidence-reset');
        this.element.dispatchEvent(event);
    }

    setStatus(text, progressValue) {
        this.statusTextTarget.textContent = text;
        if (progressValue !== undefined) {
            this.progressBarTarget.value = progressValue;
        }
    }

    showError(msg) {
        this.cleanupTransientData();
        this.errorMessageTarget.textContent = msg;
        this.setStatus('Error en la subida', 0);
        this.hideButtons();
        this.retryButtonTarget.hidden = false;
        
        // También permitimos cancelar y volver a grabar
        this.cancelButtonTarget.hidden = false;
        this.cancelButtonTarget.textContent = 'Grabar de nuevo';
    }

    hideButtons() {
        this.retryButtonTarget.hidden = true;
        this.cancelButtonTarget.hidden = true;
        this.continueButtonTarget.hidden = true;
    }
}
