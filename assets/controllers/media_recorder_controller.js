import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    static targets = [
        'idleState', 'permissionState', 'recordingState', 'previewState',
        'liveVideo', 'previewVideo', 'timer'
    ];
    static values = {
        maxDurationSeconds: { type: Number, default: 90 }
    };

    connect() {
        this.stream = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.previewUrl = null;
        this.timerInterval = null;
        this.startTime = null;
        this.mimeType = this.detectSupportedMimeType();
        this.extension = this.extensionForMimeType(this.mimeType);
        
        this.showState('idleState');
    }

    disconnect() {
        this.cleanupAggressively();
    }

    detectSupportedMimeType() {
        if (typeof MediaRecorder === 'undefined') {
            return 'video/webm'; // Fallback for file selection
        }
        const candidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4'
        ];
        return candidates.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
    }

    extensionForMimeType(mimeType) {
        if (mimeType.startsWith('video/mp4')) return 'mp4';
        if (mimeType === 'video/quicktime') return 'mov';
        return 'webm';
    }

    async requestCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Tu navegador no soporta grabación de video directamente. Por favor usa la opción de seleccionar archivo.');
            return;
        }

        this.showState('permissionState');

        try {
            // Intento 1: Cámara trasera con audio
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: true
            });
        } catch (err) {
            try {
                // Intento 2: Cámara trasera sin audio
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false
                });
            } catch (fallbackErr) {
                this.showState('idleState');
                alert('No pudimos acceder a la cámara. Por favor selecciona un archivo manualmente.');
                return;
            }
        }

        this.startRecording();
    }

    startRecording() {
        this.showState('recordingState');
        this.liveVideoTarget.srcObject = this.stream;

        this.recordedChunks = [];
        const options = { mimeType: this.mimeType };
        
        // Evitar que falle si el fallback MIME no es compatible en este device específico
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, options);
        } catch (e) {
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.mimeType = this.mediaRecorder.mimeType || 'video/webm';
            this.extension = this.extensionForMimeType(this.mimeType);
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            this.processRecording();
        };

        this.mediaRecorder.start(1000); // chunk every second
        
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            this.timerTarget.textContent = elapsed;
            
            if (elapsed >= this.maxDurationSecondsValue) {
                this.stopRecording();
            }
        }, 1000);
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.stopTracks();
        this.clearTimers();
    }

    cancelRecording() {
        this.stopTracks();
        this.clearTimers();
        this.recordedChunks = [];
        this.showState('idleState');
    }

    processRecording() {
        if (this.recordedChunks.length === 0) {
            this.showState('idleState');
            return;
        }

        const blob = new Blob(this.recordedChunks, { type: this.mimeType });
        this.currentFile = new File(
            [blob],
            `premises-${Date.now()}.${this.extension}`,
            { type: this.mimeType, lastModified: Date.now() }
        );

        this.setupPreview(this.currentFile);
    }

    handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.currentFile = file;
        this.setupPreview(file);
    }

    setupPreview(file) {
        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
        }
        this.previewUrl = URL.createObjectURL(file);
        
        this.previewVideoTarget.src = this.previewUrl;
        
        // Wait for metadata to validate duration if possible
        this.previewVideoTarget.onloadedmetadata = () => {
            if (this.previewVideoTarget.duration > this.maxDurationSecondsValue) {
                alert(`El video dura más de ${this.maxDurationSecondsValue} segundos. Por favor, selecciona uno más corto.`);
                this.reset();
                return;
            }
            this.showState('previewState');
        };

        // Fallback si no carga metadata rápido (Safari a veces)
        setTimeout(() => {
            if (this.previewVideoTarget.readyState === 0) {
                this.showState('previewState'); // Confiar en validación server-side
            }
        }, 1000);
    }

    dispatchFile() {
        if (!this.currentFile) return;

        // Emit native DOM event to be caught by r2_upload_controller
        this.element.dispatchEvent(new CustomEvent('claim:evidence-ready', {
            detail: { file: this.currentFile },
            bubbles: true
        }));
        
        // Limit local resources but don't delete `currentFile` yet just in case.
        // Actually, the user rule said: "El File debe permanecer en r2_upload. Aquí sí limpiar."
        this.cleanupAggressively(false); // keep the UI in preview or let r2 upload manage UI.
        // We actually hide our stuff and let r2-upload show its UI
        this.element.hidden = true;
    }

    reset() {
        this.cleanupAggressively();
        this.showState('idleState');
        this.element.hidden = false;
    }

    cleanupAggressively(clearFile = true) {
        this.stopTracks();
        this.clearTimers();
        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = null;
        }
        if (this.previewVideoTarget) {
            this.previewVideoTarget.src = '';
        }
        if (this.liveVideoTarget) {
            this.liveVideoTarget.srcObject = null;
        }
        this.recordedChunks.length = 0;
        if (clearFile) {
            this.currentFile = null;
        }
    }

    stopTracks() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    clearTimers() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    showState(stateName) {
        this.idleStateTarget.hidden = true;
        this.permissionStateTarget.hidden = true;
        this.recordingStateTarget.hidden = true;
        this.previewStateTarget.hidden = true;

        if (this.hasTarget(stateName)) {
            this.targets.find(stateName).hidden = false;
        }
    }
}
