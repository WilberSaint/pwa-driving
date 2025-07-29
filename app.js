// Monitor de Conducción ITSON v2.0 - Aplicación Principal
// Wilber Flores Preciado - Maestría en Ciencias de la Ingeniería

class DrivingMonitorApp {
    constructor() {
        // Estado de la aplicación
        this.isRecording = false;
        this.isPaused = false;
        this.data = [];
        this.startTime = null;
        this.pauseTime = null;
        this.totalPausedTime = 0;
        
        // Instancias de los gestores
        this.alertManager = new AlertManager();
        this.calibrationManager = new CalibrationManager();
        this.dataProcessor = new DataProcessor();
        this.exportManager = new ExportManager();
        
        // Conectar gestores
        this.exportManager.setDataProcessor(this.dataProcessor);
        
        // Referencias DOM
        this.initDOMReferences();
        
        // Configuración de sensores
        this.gpsWatchId = null;
        this.lastPosition = null;
        this.sensorConfig = {
            gps: {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 1000
            },
            updateInterval: 1000 // 1 segundo
        };
        
        // Timers
        this.updateTimer = null;
        this.saveTimer = null;
        
        this.init();
    }

    initDOMReferences() {
        // Configuración
        this.participantInput = document.getElementById('participantId');
        this.groupSelect = document.getElementById('groupType');
        
        // Controles principales
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        
        // Exportación
        this.exportJsonBtn = document.getElementById('exportJsonBtn');
        this.exportCsvBtn = document.getElementById('exportCsvBtn');
        this.exportStatsBtn = document.getElementById('exportStatsBtn');
        this.viewStatsBtn = document.getElementById('viewStatsBtn');
        this.clearDataBtn = document.getElementById('clearDataBtn');
        
        // Display de estado
        this.statusDisplay = document.getElementById('statusDisplay');
        this.recordCount = document.getElementById('recordCount');
        this.duration = document.getElementById('duration');
        this.currentSpeed = document.getElementById('currentSpeed');
        this.dataSize = document.getElementById('dataSize');
        
        // Contadores de eventos
        this.harshAccelCount = document.getElementById('harshAccelCount');
        this.harshBrakeCount = document.getElementById('harshBrakeCount');
        this.aggressiveTurnCount = document.getElementById('aggressiveTurnCount');
        this.speedingCount = document.getElementById('speedingCount');
        
        // Paneles
        this.statsPanel = document.getElementById('statsPanel');
        this.statsContent = document.getElementById('statsContent');
        this.appStatus = document.getElementById('appStatus');
    }

    async init() {
        Utils.log('info', 'Inicializando Monitor de Conducción v2.0');
        
        try {
            // Registrar Service Worker
            await this.registerServiceWorker();
            
            // Configurar event listeners
            this.setupEventListeners();
            
            // Configurar DataProcessor
            this.setupDataProcessor();
            
            // Cargar datos existentes
            this.loadExistingData();
            
            // Actualizar UI inicial
            this.updateUI();
            
            // Configurar timers
            this.setupTimers();
            
            // Verificar estado inicial
            this.updateAppStatus('Listo para usar');
            
            this.alertManager.success('✅ Aplicación inicializada correctamente');
            
        } catch (error) {
            Utils.log('error', 'Error inicializando aplicación', error);
            this.alertManager.error('❌ Error inicializando aplicación');
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('service-worker.js');
                Utils.log('info', 'Service Worker registrado', registration);
                
                // Escuchar mensajes del service worker
                navigator.serviceWorker.addEventListener('message', (event) => {
                    this.handleServiceWorkerMessage(event.data);
                });
                
            } catch (error) {
                Utils.log('error', 'Error registrando Service Worker', error);
            }
        }
    }

    setupEventListeners() {
        // Controles principales
        this.startBtn?.addEventListener('click', () => this.startRecording());
        this.pauseBtn?.addEventListener('click', () => this.togglePause());
        this.stopBtn?.addEventListener('click', () => this.stopRecording());
        
        // Exportación
        this.exportJsonBtn?.addEventListener('click', () => this.exportData('json'));
        this.exportCsvBtn?.addEventListener('click', () => this.exportData('csv'));
        this.exportStatsBtn?.addEventListener('click', () => this.exportData('stats'));
        this.viewStatsBtn?.addEventListener('click', () => this.toggleStatsPanel());
        this.clearDataBtn?.addEventListener('click', () => this.clearAllData());
        
        // Cambios en configuración
        this.participantInput?.addEventListener('blur', () => this.validateParticipantInput());
        this.groupSelect?.addEventListener('change', () => this.updateGroupSelection());
        
        // Eventos del sistema
        window.addEventListener('sensorsReady', (event) => {
            this.handleSensorsReady(event.detail);
        });
        
        // Prevenir cierre accidental durante grabación
        window.addEventListener('beforeunload', (event) => {
            if (this.isRecording) {
                event.preventDefault();
                event.returnValue = 'Hay una grabación en curso. ¿Seguro que quieres salir?';
            }
        });
        
        // Manejar visibilidad de la página
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
    }

    setupDataProcessor() {
        // Configurar eventos del procesador de datos
        this.dataProcessor.addEventListener('drivingEvent', (eventData) => {
            this.handleDrivingEvent(eventData);
        });
        
        // Configurar umbrales específicos del experimento si es necesario
        this.dataProcessor.setThresholds({
            harsh_acceleration: 2.5,
            harsh_braking: 2.5,
            aggressive_turn: 4.0,
            speeding: 15
        });
    }

    setupTimers() {
        // Timer para actualizar UI cada segundo
        this.updateTimer = setInterval(() => {
            if (this.isRecording && !this.isPaused) {
                this.updateUI();
            }
        }, 1000);
        
        // Timer para guardar datos cada 30 segundos durante grabación
        this.saveTimer = setInterval(() => {
            if (this.isRecording && this.data.length > 0) {
                this.saveDataLocally();
            }
        }, 30000);
    }

    // === CONTROL DE GRABACIÓN ===

    async startRecording() {
        try {
            const validation = this.validateStartConditions();
            if (!validation.valid) {
                this.alertManager.error(validation.message);
                return;
            }

            this.isRecording = true;
            this.isPaused = false;
            this.startTime = new Date();
            this.totalPausedTime = 0;
            
            // Resetear datos y contadores
            this.data = [];
            this.dataProcessor.resetCounters();
            
            // Actualizar UI
            this.updateRecordingStatus('recording');
            
            // Iniciar sensores
            await this.startSensors();
            
            // Notificar al service worker
            this.notifyServiceWorker('START_RECORDING');
            
            this.alertManager.success('🎯 Grabación iniciada - Conduce normalmente');
            Utils.log('info', 'Grabación iniciada', {
                participante: this.participantInput.value,
                grupo: this.groupSelect.value
            });
            
        } catch (error) {
            Utils.log('error', 'Error iniciando grabación', error);
            this.alertManager.error('❌ Error al iniciar grabación');
            this.isRecording = false;
        }
    }

    togglePause() {
        if (!this.isRecording) return;
        
        if (this.isPaused) {
            // Reanudar
            this.isPaused = false;
            const pauseDuration = new Date() - this.pauseTime;
            this.totalPausedTime += pauseDuration;
            
            this.updateRecordingStatus('recording');
            this.startSensors();
            this.alertManager.info('▶️ Grabación reanudada');
            
        } else {
            // Pausar
            this.isPaused = true;
            this.pauseTime = new Date();
            
            this.updateRecordingStatus('paused');
            this.stopSensors();
            this.alertManager.warning('⏸️ Grabación pausada');
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        this.isPaused = false;
        
        // Detener sensores
        this.stopSensors();
        
        // Guardar datos finales
        this.saveDataLocally();
        
        // Actualizar UI
        this.updateRecordingStatus('stopped');
        
        // Notificar al service worker
        this.notifyServiceWorker('STOP_RECORDING');
        
        // Mostrar resumen
        this.showSessionSummary();
        
        this.alertManager.success('⏹️ Grabación detenida. Datos guardados localmente.');
        Utils.log('info', 'Grabación detenida', {
            registros: this.data.length,
            duracion: this.getRecordingDuration()
        });
    }

    validateStartConditions() {
        const participantId = this.participantInput?.value?.trim();
        const groupType = this.groupSelect?.value;
        
        if (!participantId || !Utils.validateParticipantId(participantId)) {
            return {
                valid: false,
                message: '❌ Ingresa un ID válido (formato P01, P02, etc.)'
            };
        }
        
        if (!groupType) {
            return {
                valid: false,
                message: '❌ Selecciona el grupo experimental'
            };
        }
        
        if (!this.calibrationManager.areAllSensorsReady()) {
            return {
                valid: false,
                message: '⚠️ Ejecuta el modo prueba para verificar sensores'
            };
        }
        
        return { valid: true };
    }

    // === CONTROL DE SENSORES ===

    async startSensors() {
        try {
            // Iniciar GPS
            this.startGPS();
            
            // Iniciar acelerómetro
            this.startAccelerometer();
            
            Utils.log('info', 'Sensores iniciados');
            
        } catch (error) {
            Utils.log('error', 'Error iniciando sensores', error);
            throw error;
        }
    }

    startGPS() {
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
        }
        
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => this.onGPSUpdate(position),
            (error) => this.onGPSError(error),
            this.sensorConfig.gps
        );
    }

    startAccelerometer() {
        this.onDeviceMotion = (event) => {
            if (!this.isRecording || this.isPaused) return;
            
            const acceleration = event.accelerationIncludingGravity;
            if (!acceleration) return;
            
            this.recordDataPoint({
                type: 'motion',
                x: acceleration.x || 0,
                y: acceleration.y || 0,
                z: acceleration.z || 0
            });
        };
        
        window.addEventListener('devicemotion', this.onDeviceMotion, true);
    }

    stopSensors() {
        // Detener GPS
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }
        
        // Detener acelerómetro
        if (this.onDeviceMotion) {
            window.removeEventListener('devicemotion', this.onDeviceMotion);
            this.onDeviceMotion = null;
        }
        
        Utils.log('info', 'Sensores detenidos');
    }

    onGPSUpdate(position) {
        if (!this.isRecording || this.isPaused) return;
        
        const coords = position.coords;
        const now = new Date();
        
        // Calcular velocidad si no está disponible
        let speed = coords.speed ? coords.speed * 3.6 : 0; // m/s a km/h
        
        if (!coords.speed && this.lastPosition) {
            const distance = Utils.calculateDistance(
                this.lastPosition.latitude, this.lastPosition.longitude,
                coords.latitude, coords.longitude
            );
            const timeDiff = (now - this.lastPosition.timestamp) / 1000;
            speed = (distance / timeDiff) * 3.6;
        }
        
        this.lastPosition = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp: now
        };
        
        // Actualizar display de velocidad
        this.currentSpeed.textContent = Math.round(Math.max(0, speed));
        
        // Registrar punto GPS
        this.recordDataPoint({
            type: 'gps',
            lat: coords.latitude,
            lon: coords.longitude,
            velocidad: speed,
            accuracy: coords.accuracy,
            heading: coords.heading
        });
    }

    onGPSError(error) {
        let message = 'Error GPS: ';
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message += 'Permiso denegado';
                break;
            case error.POSITION_UNAVAILABLE:
                message += 'Posición no disponible';
                break;
            case error.TIMEOUT:
                message += 'Tiempo agotado';
                break;
            default:
                message += 'Error desconocido';
        }
        
        Utils.log('error', message, error);
        this.alertManager.warning(message);
    }

    // === PROCESAMIENTO DE DATOS ===

    recordDataPoint(sensorData) {
        if (!this.isRecording || this.isPaused) return;
        
        const now = new Date();
        const baseRecord = {
            timestamp: now.toISOString(),
            participante: this.participantInput.value.trim(),
            grupo: this.groupSelect.value,
            session_time: Math.round((now - this.startTime - this.totalPausedTime) / 1000),
            ...sensorData
        };
        
        // Combinar con último registro para datos completos
        const lastRecord = this.data[this.data.length - 1];
        const completeRecord = this.mergeWithLastRecord(baseRecord, lastRecord);
        
        // Procesar con DataProcessor
        const result = this.dataProcessor.processDataPoint(completeRecord);
        
        if (result) {
            this.data.push(result.processed);
            
            // Guardar periódicamente
            if (this.data.length % 50 === 0) {
                this.saveDataLocally();
            }
        }
    }

    mergeWithLastRecord(newRecord, lastRecord) {
        if (!lastRecord) return newRecord;
        
        // Combinar datos GPS y acelerómetro del último registro
        const merged = { ...newRecord };
        
        if (newRecord.type === 'motion' && lastRecord.lat) {
            merged.lat = lastRecord.lat;
            merged.lon = lastRecord.lon;
            merged.velocidad = lastRecord.velocidad;
        } else if (newRecord.type === 'gps' && lastRecord.x !== undefined) {
            merged.x = lastRecord.x;
            merged.y = lastRecord.y;
            merged.z = lastRecord.z;
        }
        
        return merged;
    }

    handleDrivingEvent(eventData) {
        // Actualizar contadores en UI
        this.updateEventCounters(eventData.counters);
        
        // Log del evento
        Utils.log('info', 'Evento detectado', eventData.event);
        
        // Opcional: Feedback auditivo para grupo experimental
        if (this.groupSelect.value === 'experimental') {
            this.provideFeedback(eventData.event);
        }
    }

    updateEventCounters(counters) {
        this.harshAccelCount.textContent = counters.harsh_acceleration || 0;
        this.harshBrakeCount.textContent = counters.harsh_braking || 0;
        this.aggressiveTurnCount.textContent = counters.aggressive_turn || 0;
        this.speedingCount.textContent = counters.speeding || 0;
    }

    provideFeedback(event) {
        // Feedback auditivo simple para grupo experimental
        // Esto se puede expandir según las necesidades del experimento
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Diferentes tonos para diferentes eventos
            switch (event.type) {
                case 'harsh_acceleration':
                    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.5);
                    break;
                case 'harsh_braking':
                    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.3);
                    break;
                case 'aggressive_turn':
                    oscillator.frequency.setValueAtTime(660, audioContext.currentTime); // E5
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.4);
                    break;
            }
        } catch (error) {
            Utils.log('warn', 'Error generando feedback auditivo', error);
        }
    }

    // === GESTIÓN DE DATOS ===

    saveDataLocally() {
        try {
            const participantId = this.participantInput.value.trim();
            const today = Utils.formatDateTime().date;
            const key = `driving_data_${participantId}_${today}`;
            
            const dataToSave = {
                participante: participantId,
                grupo: this.groupSelect.value,
                fecha: today,
                inicio: this.startTime ? this.startTime.toISOString() : null,
                ultima_actualizacion: new Date().toISOString(),
                duracion_total_seg: this.getRecordingDuration(),
                total_registros: this.data.length,
                contadores_eventos: this.dataProcessor.getCurrentCounters(),
                datos: this.data
            };
            
            Storage.set(key, dataToSave);
            Utils.log('info', `Datos guardados localmente: ${this.data.length} registros`);
            
        } catch (error) {
            Utils.log('error', 'Error guardando datos localmente', error);
            this.alertManager.warning('⚠️ Error guardando datos localmente');
        }
    }

    loadExistingData() {
        try {
            const participantId = this.participantInput?.value?.trim();
            if (!participantId) return;
            
            const today = Utils.formatDateTime().date;
            const key = `driving_data_${participantId}_${today}`;
            const savedData = Storage.get(key);
            
            if (savedData && savedData.datos) {
                this.data = savedData.datos;
                
                // Restaurar contadores del procesador
                if (savedData.contadores_eventos) {
                    Object.keys(savedData.contadores_eventos).forEach(eventType => {
                        this.dataProcessor.eventCounters[eventType] = savedData.contadores_eventos[eventType];
                    });
                    this.updateEventCounters(savedData.contadores_eventos);
                }
                
                this.alertManager.info(`💾 Datos existentes cargados: ${this.data.length} registros`);
                this.updateExportButtons();
            }
            
        } catch (error) {
            Utils.log('error', 'Error cargando datos existentes', error);
        }
    }

    clearAllData() {
        if (this.isRecording) {
            this.alertManager.warning('⚠️ No se puede limpiar datos durante grabación');
            return;
        }
        
        if (confirm('¿Estás seguro de que quieres eliminar todos los datos? Esta acción no se puede deshacer.')) {
            try {
                // Limpiar datos en memoria
                this.data = [];
                this.dataProcessor.resetCounters();
                
                // Limpiar localStorage
                const participantId = this.participantInput?.value?.trim();
                if (participantId) {
                    const today = Utils.formatDateTime().date;
                    const key = `driving_data_${participantId}_${today}`;
                    Storage.remove(key);
                }
                
                // Actualizar UI
                this.updateEventCounters(this.dataProcessor.getCurrentCounters());
                this.updateExportButtons();
                this.hideStatsPanel();
                
                this.alertManager.success('🗑️ Todos los datos han sido eliminados');
                Utils.log('info', 'Datos eliminados por usuario');
                
            } catch (error) {
                Utils.log('error', 'Error eliminando datos', error);
                this.alertManager.error('❌ Error eliminando datos');
            }
        }
    }

    // === EXPORTACIÓN ===

    async exportData(format) {
        try {
            const participantId = this.participantInput?.value?.trim();
            const groupType = this.groupSelect?.value || 'unknown';
            
            if (!participantId) {
                this.alertManager.error('❌ Ingresa el ID del participante');
                return;
            }
            
            if (this.data.length === 0) {
                this.alertManager.warning('⚠️ No hay datos para exportar');
                return;
            }
            
            // Validar datos antes de exportar
            const validation = this.exportManager.validateExportData(this.data, participantId);
            if (!validation.valid) {
                this.alertManager.error('❌ ' + validation.errors.join(', '));
                return;
            }
            
            // Exportar según formato
            switch (format) {
                case 'json':
                    await this.exportManager.exportJSON(this.data, participantId, groupType);
                    break;
                case 'csv':
                    await this.exportManager.exportCSV(this.data, participantId, groupType);
                    break;
                case 'stats':
                    await this.exportManager.exportStatistics(this.data, participantId, groupType);
                    break;
                case 'all':
                    await this.exportManager.exportAll(this.data, participantId, groupType);
                    break;
                default:
                    throw new Error('Formato de exportación no válido');
            }
            
        } catch (error) {
            Utils.log('error', 'Error en exportación', error);
            this.alertManager.error('❌ Error en exportación: ' + error.message);
        }
    }

    // === UI Y ESTADO ===

    updateUI() {
        // Actualizar contadores básicos
        this.recordCount.textContent = this.data.length;
        
        // Actualizar duración
        if (this.isRecording && this.startTime) {
            const elapsed = this.getRecordingDuration();
            this.duration.textContent = Utils.formatDuration(elapsed);
        }
        
        // Actualizar tamaño de datos
        const sizeBytes = JSON.stringify(this.data).length;
        this.dataSize.textContent = Math.round(sizeBytes / 1024);
        
        // Actualizar botones de exportación
        this.updateExportButtons();
        
        // Cargar datos cuando cambie participante
        if (!this.isRecording) {
            this.loadExistingData();
        }
    }

    updateRecordingStatus(status) {
        const statusIndicator = this.statusDisplay?.querySelector('.status-indicator');
        const statusText = this.statusDisplay?.querySelector('strong');
        
        if (!statusIndicator || !statusText) return;
        
        // Resetear clases
        statusIndicator.className = 'status-indicator';
        
        switch (status) {
            case 'recording':
                statusIndicator.classList.add('status-recording');
                statusText.textContent = '🔴 Grabando...';
                this.startBtn.disabled = true;
                this.pauseBtn.disabled = false;
                this.pauseBtn.classList.remove('hidden');
                this.stopBtn.disabled = false;
                this.participantInput.disabled = true;
                this.groupSelect.disabled = true;
                break;
                
            case 'paused':
                statusIndicator.classList.add('status-paused');
                statusText.textContent = '⏸️ Pausado';
                this.pauseBtn.textContent = '▶️ Reanudar';
                break;
                
            case 'stopped':
            default:
                statusIndicator.classList.add('status-stopped');
                statusText.textContent = 'Sistema Detenido';
                this.startBtn.disabled = false;
                this.pauseBtn.disabled = true;
                this.pauseBtn.classList.add('hidden');
                this.pauseBtn.textContent = '⏸️ Pausar';
                this.stopBtn.disabled = true;
                this.participantInput.disabled = false;
                this.groupSelect.disabled = false;
                break;
        }
    }

    updateExportButtons() {
        const hasData = this.data.length > 0;
        
        this.exportJsonBtn.disabled = !hasData;
        this.exportCsvBtn.disabled = !hasData;
        this.exportStatsBtn.disabled = !hasData;
        this.viewStatsBtn.disabled = !hasData;
    }

    getRecordingDuration() {
        if (!this.startTime) return 0;
        
        const endTime = this.isPaused ? this.pauseTime : new Date();
        return Math.floor((endTime - this.startTime - this.totalPausedTime) / 1000);
    }

    // === ESTADÍSTICAS ===

    toggleStatsPanel() {
        if (this.statsPanel.classList.contains('hidden')) {
            this.showStatsPanel();
        } else {
            this.hideStatsPanel();
        }
    }

    showStatsPanel() {
        if (this.data.length === 0) {
            this.alertManager.warning('⚠️ No hay datos para mostrar estadísticas');
            return;
        }
        
        const stats = this.dataProcessor.generateSessionStats(this.data);
        this.renderStats(stats);
        
        this.statsPanel.classList.remove('hidden');
        this.viewStatsBtn.textContent = '👁️ Ocultar Resumen';
    }

    hideStatsPanel() {
        this.statsPanel.classList.add('hidden');
        this.viewStatsBtn.textContent = '👁️ Ver Resumen';
    }

    renderStats(stats) {
        if (!stats || stats.error) {
            this.statsContent.innerHTML = '<p>Error generando estadísticas</p>';
            return;
        }
        
        this.statsContent.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h4>📊 Resumen de Sesión</h4>
                    <p><strong>Registros:</strong> ${stats.session_summary?.total_records || 0}</p>
                    <p><strong>Distancia:</strong> ${stats.session_summary?.total_distance_km || 0} km</p>
                    <p><strong>Tiempo:</strong> ${stats.session_summary?.total_time_minutes || 0} min</p>
                    <p><strong>Velocidad promedio:</strong> ${stats.session_summary?.average_speed || 0} km/h</p>
                    <p><strong>Velocidad máxima:</strong> ${stats.session_summary?.max_speed || 0} km/h</p>
                </div>
                
                <div class="stat-card">
                    <h4>⚠️ Eventos Detectados</h4>
                    <p><strong>Total:</strong> ${stats.events_summary?.total_events || 0}</p>
                    <p><strong>Aceleración brusca:</strong> ${stats.events_summary?.harsh_acceleration || 0}</p>
                    <p><strong>Frenado brusco:</strong> ${stats.events_summary?.harsh_braking || 0}</p>
                    <p><strong>Giros agresivos:</strong> ${stats.events_summary?.aggressive_turns || 0}</p>
                    <p><strong>Exceso velocidad:</strong> ${stats.events_summary?.speeding_events || 0}</p>
                </div>
                
                <div class="stat-card">
                    <h4>📈 Eventos por Kilómetro</h4>
                    <p><strong>Aceleración:</strong> ${stats.events_per_km?.harsh_acceleration_per_km || 0}/km</p>
                    <p><strong>Frenado:</strong> ${stats.events_per_km?.harsh_braking_per_km || 0}/km</p>
                    <p><strong>Giros:</strong> ${stats.events_per_km?.aggressive_turns_per_km || 0}/km</p>
                    <p><strong>Velocidad:</strong> ${stats.events_per_km?.speeding_per_km || 0}/km</p>
                    <p><strong>Total:</strong> ${stats.events_per_km?.total_events_per_km || 0}/km</p>
                </div>
                
                <div class="stat-card">
                    <h4>🎯 Evaluación de Riesgo</h4>
                    <p><strong>Nivel:</strong> ${stats.risk_assessment?.level || 'N/A'}</p>
                    <p><strong>Puntuación:</strong> ${stats.risk_assessment?.score || 0}/100</p>
                    <p><strong>Descripción:</strong> ${stats.risk_assessment?.description || ''}</p>
                </div>
            </div>
            
            ${stats.recommendations?.length > 0 ? `
                <div class="recommendations">
                    <h4>💡 Recomendaciones</h4>
                    <ul>
                        ${stats.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        `;
    }

    showSessionSummary() {
        if (this.data.length === 0) return;
        
        const duration = this.getRecordingDuration();
        const events = this.dataProcessor.getCurrentCounters();
        const totalEvents = Object.values(events).reduce((a, b) => a + b, 0);
        
        const summary = `
📊 Sesión Completada
• Duración: ${Utils.formatDuration(duration)}
• Registros: ${this.data.length}
• Eventos detectados: ${totalEvents}
• Participante: ${this.participantInput.value}
• Grupo: ${this.groupSelect.value}
        `;
        
        this.alertManager.info(summary, 10000);
    }

    // === MANEJO DE EVENTOS DEL SISTEMA ===

    handleSensorsReady(sensorStatus) {
        if (sensorStatus.gps && sensorStatus.accelerometer) {
            this.startBtn.disabled = false;
            this.updateAppStatus('Sensores listos');
        } else {
            this.startBtn.disabled = true;
            this.updateAppStatus('Verificando sensores...');
        }
    }

    handleServiceWorkerMessage(data) {
        switch (data.type) {
            case 'SW_ALIVE':
                Utils.log('info', 'Service Worker activo');
                break;
            case 'SYNC_COMPLETE':
                this.alertManager.info(`📤 ${data.count} registros sincronizados`);
                break;
        }
    }

    handleVisibilityChange() {
        if (document.hidden && this.isRecording) {
            Utils.log('info', 'App en segundo plano - grabación continúa');
            this.notifyServiceWorker('KEEP_ALIVE');
        } else if (!document.hidden) {
            Utils.log('info', 'App en primer plano');
        }
    }

    validateParticipantInput() {
        const participantId = this.participantInput?.value?.trim();
        if (participantId && !Utils.validateParticipantId(participantId)) {
            this.alertManager.warning('⚠️ Formato de ID inválido. Usar P01, P02, etc.');
            this.participantInput.focus();
        } else if (participantId) {
            this.loadExistingData();
        }
    }

    updateGroupSelection() {
        const groupType = this.groupSelect?.value;
        if (groupType) {
            Utils.log('info', 'Grupo seleccionado', groupType);
            
            if (groupType === 'experimental') {
                this.alertManager.info('🔊 Grupo experimental: Feedback auditivo activado');
            } else {
                this.alertManager.info('🔇 Grupo control: Sin feedback auditivo');
            }
        }
    }

    notifyServiceWorker(type, data = {}) {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: type,
                data: data,
                timestamp: new Date().toISOString()
            });
        }
    }

    updateAppStatus(status) {
        if (this.appStatus) {
            this.appStatus.textContent = status;
        }
    }

    // === LIMPIEZA ===

    destroy() {
        // Limpiar timers
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }
        
        // Detener sensores
        this.stopSensors();
        
        // Guardar datos finales
        if (this.data.length > 0) {
            this.saveDataLocally();
        }
        
        Utils.log('info', 'Aplicación destruida correctamente');
    }
}

// Inicializar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.drivingApp = new DrivingMonitorApp();
});

// Manejar cierre de la aplicación
window.addEventListener('beforeunload', () => {
    if (window.drivingApp) {
        window.drivingApp.destroy();
    }
});