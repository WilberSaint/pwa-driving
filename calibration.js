// Calibración y Modo Prueba - Monitor de Conducción ITSON v2.0
// Sistema de diagnóstico y validación de sensores

class CalibrationManager {
    constructor() {
        this.isTestMode = false;
        this.diagnosticInterval = null;
        this.gpsWatchId = null;
        this.sensorData = {
            gps: { ready: false, data: null, lastUpdate: null },
            accelerometer: { ready: false, data: null, lastUpdate: null }
        };
        
        // Elementos DOM
        this.diagnosticPanel = document.getElementById('diagnosticPanel');
        this.testModeBtn = document.getElementById('testModeBtn');
        this.recordModeBtn = document.getElementById('recordModeBtn');
        
        // Elementos de diagnóstico GPS
        this.gpsStatus = document.getElementById('gpsStatus');
        this.gpsLat = document.getElementById('gpsLat');
        this.gpsLon = document.getElementById('gpsLon');
        this.gpsAccuracy = document.getElementById('gpsAccuracy');
        this.gpsSpeed = document.getElementById('gpsSpeed');
        this.gpsReady = document.getElementById('gpsReady');
        
        // Elementos de diagnóstico Acelerómetro
        this.accelStatus = document.getElementById('accelStatus');
        this.accelX = document.getElementById('accelX');
        this.accelY = document.getElementById('accelY');
        this.accelZ = document.getElementById('accelZ');
        this.accelMag = document.getElementById('accelMag');
        this.accelReady = document.getElementById('accelReady');
        
        // Elementos de estado del sistema
        this.batteryLevel = document.getElementById('batteryLevel');
        this.storageSpace = document.getElementById('storageSpace');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        
        this.alertManager = new AlertManager();
        this.init();
    }

    init() {
        // Event listeners
        this.testModeBtn?.addEventListener('click', () => this.toggleTestMode());
        this.recordModeBtn?.addEventListener('click', () => this.switchToRecordMode());
        
        // Actualizar información del sistema cada 5 segundos
        setInterval(() => this.updateSystemInfo(), 5000);
        
        // Verificación inicial
        this.performInitialChecks();
    }

    async performInitialChecks() {
        Utils.log('info', 'Iniciando verificaciones del sistema');
        
        try {
            // Verificar capacidades del navegador
            const capabilities = Utils.checkBrowserCapabilities();
            this.validateBrowserCapabilities(capabilities);
            
            // Verificar información del dispositivo
            const deviceInfo = Utils.getDeviceInfo();
            Utils.log('info', 'Información del dispositivo', deviceInfo);
            
            // Actualizar estado inicial
            this.updateConnectionStatus('checking', 'Verificando sensores...');
            
            // Verificar permisos básicos
            await this.checkBasicPermissions();
            
            // Actualizar información del sistema
            await this.updateSystemInfo();
            
        } catch (error) {
            Utils.log('error', 'Error en verificaciones iniciales', error);
            this.updateConnectionStatus('error', 'Error en verificación inicial');
        }
    }

    validateBrowserCapabilities(capabilities) {
        const missing = [];
        
        if (!capabilities.geolocation) missing.push('GPS');
        if (!capabilities.deviceMotion) missing.push('Acelerómetro');
        if (!capabilities.localStorage) missing.push('Almacenamiento local');
        
        if (missing.length > 0) {
            this.alertManager.error(`Funciones no disponibles: ${missing.join(', ')}`);
            Utils.log('error', 'Capacidades faltantes', missing);
        } else {
            this.alertManager.success('Todas las funciones del navegador están disponibles');
        }
    }

    async checkBasicPermissions() {
        try {
            // Verificar permiso de ubicación
            const permissionStatus = await navigator.permissions.query({name: 'geolocation'});
            
            if (permissionStatus.state === 'denied') {
                this.alertManager.error('Permiso de ubicación denegado');
                return false;
            }
            
            return true;
        } catch (error) {
            Utils.log('warn', 'No se pudo verificar permisos', error);
            return true; // Continuar de todos modos
        }
    }

    toggleTestMode() {
        if (this.isTestMode) {
            this.stopTestMode();
        } else {
            this.startTestMode();
        }
    }

    startTestMode() {
        this.isTestMode = true;
        this.diagnosticPanel.classList.remove('hidden');
        this.testModeBtn.textContent = '⏹️ Detener Prueba';
        this.testModeBtn.classList.add('btn-danger');
        this.testModeBtn.classList.remove('btn-test');
        
        this.alertManager.info('Modo prueba activado - Verificando sensores...');
        
        // Iniciar diagnóstico de sensores
        this.startSensorDiagnostics();
        
        Utils.log('info', 'Modo prueba iniciado');
    }

    stopTestMode() {
        this.isTestMode = false;
        this.diagnosticPanel.classList.add('hidden');
        this.testModeBtn.textContent = '🔧 Modo Prueba';
        this.testModeBtn.classList.remove('btn-danger');
        this.testModeBtn.classList.add('btn-test');
        
        // Detener diagnósticos
        this.stopSensorDiagnostics();
        
        this.alertManager.info('Modo prueba desactivado');
        Utils.log('info', 'Modo prueba detenido');
    }

    switchToRecordMode() {
        if (this.isTestMode) {
            this.stopTestMode();
        }
        
        // Verificar que los sensores estén listos
        if (!this.sensorData.gps.ready || !this.sensorData.accelerometer.ready) {
            this.alertManager.warning('⚠️ Algunos sensores no están listos. Ejecuta el modo prueba primero.');
            return;
        }
        
        this.alertManager.success('✅ Sensores verificados. Listo para experimento.');
        
        // Emitir evento para que la aplicación principal sepa que está listo
        window.dispatchEvent(new CustomEvent('sensorsReady', {
            detail: {
                gps: this.sensorData.gps.ready,
                accelerometer: this.sensorData.accelerometer.ready
            }
        }));
    }

    startSensorDiagnostics() {
        // Iniciar GPS
        this.startGPSDiagnostic();
        
        // Iniciar acelerómetro
        this.startAccelerometerDiagnostic();
        
        // Actualizar display cada segundo
        this.diagnosticInterval = setInterval(() => {
            this.updateDiagnosticDisplay();
        }, 1000);
    }

    stopSensorDiagnostics() {
        // Detener GPS
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }
        
        // Detener acelerómetro
        window.removeEventListener('devicemotion', this.onDeviceMotion);
        
        // Detener actualización de display
        if (this.diagnosticInterval) {
            clearInterval(this.diagnosticInterval);
            this.diagnosticInterval = null;
        }
    }

    startGPSDiagnostic() {
        const options = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 1000
        };

        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => this.onGPSSuccess(position),
            (error) => this.onGPSError(error),
            options
        );
    }

    onGPSSuccess(position) {
        const coords = position.coords;
        const now = Date.now();
        
        this.sensorData.gps = {
            ready: true,
            data: {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
                speed: coords.speed || 0,
                heading: coords.heading,
                timestamp: position.timestamp
            },
            lastUpdate: now
        };

        // Actualizar estado de conexión si es la primera vez
        if (this.sensorData.accelerometer.ready) {
            this.updateConnectionStatus('connected', 'Todos los sensores funcionando');
        }
    }

    onGPSError(error) {
        Utils.log('error', 'Error GPS', error);
        this.sensorData.gps.ready = false;
        
        let message = 'Error GPS: ';
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message += 'Permiso denegado';
                break;
            case error.POSITION_UNAVAILABLE:
                message += 'Posición no disponible';
                break;
            case error.TIMEOUT:
                message += 'Tiempo de espera agotado';
                break;
            default:
                message += 'Error desconocido';
        }
        
        this.alertManager.error(message);
        this.updateConnectionStatus('error', 'Error en GPS');
    }

    startAccelerometerDiagnostic() {
        if (!window.DeviceMotionEvent) {
            this.alertManager.error('Acelerómetro no disponible en este dispositivo');
            return;
        }

        // Función para manejar eventos de movimiento
        this.onDeviceMotion = (event) => {
            const acceleration = event.accelerationIncludingGravity;
            if (!acceleration) return;

            const now = Date.now();
            this.sensorData.accelerometer = {
                ready: true,
                data: {
                    x: acceleration.x || 0,
                    y: acceleration.y || 0,
                    z: acceleration.z || 0,
                    interval: event.interval
                },
                lastUpdate: now
            };
        };

        // Verificar si necesita permisos (iOS 13+)
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('devicemotion', this.onDeviceMotion, true);
                        this.alertManager.success('Permisos de sensores concedidos');
                    } else {
                        this.alertManager.error('Permisos de sensores denegados');
                    }
                })
                .catch(error => {
                    Utils.log('error', 'Error solicitando permisos', error);
                });
        } else {
            // Dispositivos que no necesitan permisos explícitos
            window.addEventListener('devicemotion', this.onDeviceMotion, true);
        }
    }

    updateDiagnosticDisplay() {
        // Actualizar GPS
        if (this.sensorData.gps.ready && this.sensorData.gps.data) {
            const gps = this.sensorData.gps.data;
            this.gpsStatus.textContent = '✅';
            this.gpsLat.textContent = Utils.formatNumber(gps.latitude, 6);
            this.gpsLon.textContent = Utils.formatNumber(gps.longitude, 6);
            this.gpsAccuracy.textContent = Utils.formatNumber(gps.accuracy, 1);
            this.gpsSpeed.textContent = Utils.formatNumber(gps.speed * 3.6, 1); // m/s a km/h
            this.gpsReady.textContent = '✅';
        } else {
            this.gpsStatus.textContent = '❌';
            this.gpsReady.textContent = '❌';
        }

        // Actualizar Acelerómetro
        if (this.sensorData.accelerometer.ready && this.sensorData.accelerometer.data) {
            const accel = this.sensorData.accelerometer.data;
            const magnitude = Math.sqrt(accel.x**2 + accel.y**2 + accel.z**2);
            
            this.accelStatus.textContent = '✅';
            this.accelX.textContent = Utils.formatNumber(accel.x, 2);
            this.accelY.textContent = Utils.formatNumber(accel.y, 2);
            this.accelZ.textContent = Utils.formatNumber(accel.z, 2);
            this.accelMag.textContent = Utils.formatNumber(magnitude, 2);
            this.accelReady.textContent = '✅';
        } else {
            this.accelStatus.textContent = '❌';
            this.accelReady.textContent = '❌';
        }

        // Detectar si los datos están obsoletos (>5 segundos)
        const now = Date.now();
        if (this.sensorData.gps.lastUpdate && now - this.sensorData.gps.lastUpdate > 5000) {
            this.gpsStatus.textContent = '⚠️';
            this.gpsReady.textContent = '⚠️';
        }
        
        if (this.sensorData.accelerometer.lastUpdate && now - this.sensorData.accelerometer.lastUpdate > 5000) {
            this.accelStatus.textContent = '⚠️';
            this.accelReady.textContent = '⚠️';
        }
    }

    async updateSystemInfo() {
        try {
            // Información de batería
            const battery = await Utils.getBatteryInfo();
            if (battery) {
                const batteryText = `${battery.level}% ${battery.charging ? '🔌' : '🔋'}`;
                this.batteryLevel.textContent = batteryText;
                
                if (battery.level < 20 && !battery.charging) {
                    this.batteryLevel.style.color = '#ff5252';
                    if (battery.level < 10) {
                        this.alertManager.warning('⚠️ Batería muy baja. Conecta el cargador.');
                    }
                } else {
                    this.batteryLevel.style.color = 'inherit';
                }
            } else {
                this.batteryLevel.textContent = 'N/A';
            }

            // Información de almacenamiento
            const storage = await Utils.getStorageInfo();
            if (storage) {
                this.storageSpace.textContent = `${storage.available} MB libre`;
                
                if (storage.available < 100) {
                    this.storageSpace.style.color = '#ff5252';
                    this.alertManager.warning('⚠️ Poco espacio de almacenamiento disponible.');
                } else {
                    this.storageSpace.style.color = 'inherit';
                }
            } else {
                this.storageSpace.textContent = 'N/A';
            }

        } catch (error) {
            Utils.log('warn', 'Error actualizando información del sistema', error);
        }
    }

    updateConnectionStatus(status, message) {
        this.statusText.textContent = message;
        
        // Actualizar el indicador visual
        this.statusDot.className = 'status-dot';
        switch (status) {
            case 'connected':
                this.statusDot.classList.add('connected');
                break;
            case 'error':
                this.statusDot.classList.add('error');
                break;
            default:
                // Mantener animación de pulse para 'checking'
                break;
        }
    }

    // Métodos públicos para acceso externo
    isGPSReady() {
        return this.sensorData.gps.ready;
    }

    isAccelerometerReady() {
        return this.sensorData.accelerometer.ready;
    }

    areAllSensorsReady() {
        return this.isGPSReady() && this.isAccelerometerReady();
    }

    getLastGPSData() {
        return this.sensorData.gps.data;
    }

    getLastAccelerometerData() {
        return this.sensorData.accelerometer.data;
    }

    // Generar reporte de diagnóstico
    generateDiagnosticReport() {
        const deviceInfo = Utils.getDeviceInfo();
        const capabilities = Utils.checkBrowserCapabilities();
        
        return {
            timestamp: new Date().toISOString(),
            device: deviceInfo,
            browser_capabilities: capabilities,
            sensors: {
                gps: {
                    ready: this.sensorData.gps.ready,
                    last_update: this.sensorData.gps.lastUpdate,
                    data_sample: this.sensorData.gps.data
                },
                accelerometer: {
                    ready: this.sensorData.accelerometer.ready,
                    last_update: this.sensorData.accelerometer.lastUpdate,
                    data_sample: this.sensorData.accelerometer.data
                }
            },
            logs: Utils.getLogs().slice(-10) // Últimos 10 logs
        };
    }
}

// Exportar para uso global
window.CalibrationManager = CalibrationManager;