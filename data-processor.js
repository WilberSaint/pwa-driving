// Procesador de Datos FIELD-TESTED - Monitor de Conducción ITSON v2.2
// Calibrado basado en pruebas reales P01/P02 en Sinaloa

class DataProcessor {
    constructor() {
        // Umbrales CALIBRADOS basados en pruebas de campo
        this.thresholds = {
            // Aceleración - MÁS SENSIBLES para condiciones mexicanas
            harsh_acceleration: 2.0,    // Reducido de 3.5 a 2.0 m/s²
            harsh_braking: 2.0,         // Reducido de 3.5 a 2.0 m/s²  
            aggressive_turn: 3.0,       // Reducido de 5.5 a 3.0 m/s²
            
            // Velocidad - Más permisivo
            speeding: 25,               // Aumentado de 20 a 25 km/h sobre límite
            minimum_speed: 3,           // Reducido de 5 a 3 km/h
            
            // NUEVA: Detección sin GPS (basada solo en acelerómetro)
            motion_threshold: 1.5,      // Variación mínima en aceleración para detectar movimiento
            sustained_motion: 5,        // Segundos de movimiento sostenido
            
            // Filtros anti-ruido MÁS PERMISIVOS
            acceleration_noise: 0.5,    // Reducido de 1.0 a 0.5 m/s²
            gps_noise: 1.0,            // Reducido de 2.0 a 1.0 km/h
            stability_time: 2000       // Reducido de 3000 a 2000 ms
        };

        // Contadores de eventos
        this.eventCounters = {
            harsh_acceleration: 0,
            harsh_braking: 0,
            aggressive_turn: 0,
            speeding: 0
        };

        // Buffer para análisis temporal
        this.dataBuffer = [];
        this.bufferSize = 8; // Aumentado para mejor análisis
        
        // NUEVA: Variables para detección de movimiento sin GPS
        this.accelerationHistory = [];
        this.motionHistory = [];
        this.baselineAcceleration = null;
        this.movementStartTime = null;
        this.lastEventTime = {};
        
        // Variables de estado mejoradas
        this.isVehicleMoving = false;
        this.movementConfidence = 0;
        this.gpsAvailable = false;
        
        // Control de frecuencia más agresivo
        this.lastRecordTime = 0;
        this.recordInterval = 1500; // 1.5 segundos (más frecuente para captar eventos)
        
        // Límites de velocidad para Sinaloa
        this.speedLimits = {
            urban: 60,
            highway: 110,
            residential: 40,
            school: 20,
            default: 60
        };
        
        this.currentSpeedLimit = this.speedLimits.default;
        this.eventListeners = new Map();
        
        Utils.log('info', 'DataProcessor FIELD-TESTED inicializado', this.thresholds);
    }

    // Procesar datos con detección híbrida (GPS + Solo-Acelerómetro)
    processDataPoint(rawData) {
        try {
            // Control de frecuencia
            const now = Date.now();
            if (now - this.lastRecordTime < this.recordInterval) {
                return null;
            }
            this.lastRecordTime = now;

            // Validar estructura
            if (!Utils.validateDataStructure(rawData)) {
                Utils.log('warn', 'Estructura de datos inválida', rawData);
                return null;
            }

            // NUEVA: Detección híbrida de movimiento
            this.updateHybridMovementDetection(rawData);
            
            // Enriquecer datos
            const processedData = this.enrichDataFieldTested(rawData);
            
            // Detectar eventos con múltiples métodos
            const events = this.detectEventsHybrid(processedData);
            
            // Actualizar buffer
            this.updateBuffer(processedData);
            
            // Actualizar contadores
            events.forEach(event => {
                if (this.eventCounters.hasOwnProperty(event.type)) {
                    this.eventCounters[event.type]++;
                }
                
                this.emitEvent('drivingEvent', {
                    event: event,
                    counters: this.eventCounters,
                    data: processedData
                });
            });

            return {
                processed: processedData,
                events: events,
                counters: this.eventCounters
            };

        } catch (error) {
            Utils.log('error', 'Error procesando datos', error);
            return null;
        }
    }

    // NUEVA: Detección híbrida de movimiento (GPS + Acelerómetro)
    updateHybridMovementDetection(rawData) {
        // Método 1: GPS (si está disponible)
        const hasGPS = rawData.lat && rawData.lon;
        this.gpsAvailable = hasGPS;
        
        let gpsMotion = false;
        let accelMotion = false;
        let speedCriteria = false;
        
        if (hasGPS) {
            const speed = rawData.velocidad || 0;
            speedCriteria = speed > this.thresholds.minimum_speed;
            gpsMotion = this.hasGPSMovement(rawData);
        }
        
        // Método 2: Solo Acelerómetro (NUEVA función principal)
        accelMotion = this.detectMotionFromAccelerometer(rawData);
        
        // Combinar evidencias
        let confidence = 0;
        
        if (this.gpsAvailable) {
            // Con GPS: método tradicional mejorado
            if (speedCriteria) confidence += 40;
            if (gpsMotion) confidence += 30;
            if (accelMotion) confidence += 30;
        } else {
            // Sin GPS: basado solo en acelerómetro (NUEVO)
            if (accelMotion) confidence += 70;
            if (this.hasSustainedMotion()) confidence += 30;
        }
        
        this.movementConfidence = Math.min(confidence, 100);
        
        // NUEVO: Umbral más bajo para sin GPS
        const threshold = this.gpsAvailable ? 50 : 40;
        this.isVehicleMoving = this.movementConfidence > threshold;
        
        // Log cambios de estado
        if (this.isVehicleMoving !== this.wasMoving) {
            Utils.log('info', `Movimiento: ${this.isVehicleMoving} (GPS: ${this.gpsAvailable}, Conf: ${this.movementConfidence}%)`);
            this.wasMoving = this.isVehicleMoving;
        }
    }

    // NUEVA: Detectar movimiento solo con acelerómetro
    detectMotionFromAccelerometer(data) {
        if (!data.x || !data.y || !data.z) return false;
        
        const currentAccel = {
            x: data.x,
            y: data.y,
            z: data.z,
            magnitude: Math.sqrt(data.x**2 + data.y**2 + data.z**2),
            timestamp: Date.now()
        };
        
        // Mantener historial de aceleración
        this.accelerationHistory.push(currentAccel);
        if (this.accelerationHistory.length > 10) {
            this.accelerationHistory.shift();
        }
        
        // Establecer baseline si no existe
        if (!this.baselineAcceleration && this.accelerationHistory.length >= 5) {
            this.baselineAcceleration = this.calculateAccelerationBaseline();
        }
        
        if (!this.baselineAcceleration) return false;
        
        // Detectar variación significativa respecto al baseline
        const variation = this.calculateAccelerationVariation(currentAccel);
        const isMoving = variation > this.thresholds.motion_threshold;
        
        // Mantener historial de movimiento
        this.motionHistory.push({
            moving: isMoving,
            variation: variation,
            timestamp: Date.now()
        });
        
        if (this.motionHistory.length > 20) {
            this.motionHistory.shift();
        }
        
        return isMoving;
    }

    // Calcular baseline de aceleración (estado de reposo)
    calculateAccelerationBaseline() {
        if (this.accelerationHistory.length < 5) return null;
        
        const recent = this.accelerationHistory.slice(-5);
        return {
            x: recent.reduce((sum, a) => sum + a.x, 0) / recent.length,
            y: recent.reduce((sum, a) => sum + a.y, 0) / recent.length,
            z: recent.reduce((sum, a) => sum + a.z, 0) / recent.length,
            magnitude: recent.reduce((sum, a) => sum + a.magnitude, 0) / recent.length
        };
    }

    // Calcular variación respecto al baseline
    calculateAccelerationVariation(current) {
        if (!this.baselineAcceleration) return 0;
        
        const deltaX = Math.abs(current.x - this.baselineAcceleration.x);
        const deltaY = Math.abs(current.y - this.baselineAcceleration.y);
        const deltaZ = Math.abs(current.z - this.baselineAcceleration.z);
        
        return Math.sqrt(deltaX**2 + deltaY**2 + deltaZ**2);
    }

    // Verificar movimiento sostenido
    hasSustainedMotion() {
        if (this.motionHistory.length < 5) return false;
        
        const recent = this.motionHistory.slice(-5);
        const movingCount = recent.filter(m => m.moving).length;
        
        return movingCount >= 3; // 3 de 5 últimas lecturas indican movimiento
    }

    // Enriquecimiento de datos mejorado
    enrichDataFieldTested(rawData) {
        const enriched = { ...rawData };
        const now = new Date(rawData.timestamp);

        // Calcular magnitud de aceleración
        if (rawData.x !== undefined && rawData.y !== undefined && rawData.z !== undefined) {
            enriched.acceleration_magnitude = Math.sqrt(
                rawData.x ** 2 + rawData.y ** 2 + rawData.z ** 2
            );
            
            // NUEVA: Aceleración filtrada para detección de eventos
            enriched.filtered_acceleration = this.calculateFilteredAcceleration(rawData);
        }

        // NUEVA: Velocidad estimada sin GPS
        if (!rawData.velocidad && this.isVehicleMoving) {
            enriched.estimated_speed = this.estimateSpeedFromAccelerometer();
        }

        // Aceleración longitudinal mejorada
        if (this.dataBuffer.length > 0) {
            enriched.longitudinal_acceleration = this.calculateLongitudinalAcceleration(enriched);
        }

        // Metadatos de detección
        enriched.vehicle_moving = this.isVehicleMoving;
        enriched.movement_confidence = this.movementConfidence;
        enriched.gps_available = this.gpsAvailable;
        enriched.detection_method = this.gpsAvailable ? 'GPS+Accel' : 'Accel-Only';
        
        return enriched;
    }

    // NUEVA: Calcular aceleración filtrada para eventos
    calculateFilteredAcceleration(data) {
        if (!this.baselineAcceleration) return { x: data.x, y: data.y, z: data.z };
        
        return {
            x: data.x - this.baselineAcceleration.x,
            y: data.y - this.baselineAcceleration.y,
            z: data.z - this.baselineAcceleration.z
        };
    }

    // NUEVA: Estimar velocidad sin GPS
    estimateSpeedFromAccelerometer() {
        if (this.accelerationHistory.length < 3) return 0;
        
        const recent = this.accelerationHistory.slice(-3);
        const avgVariation = recent.reduce((sum, a) => {
            return sum + this.calculateAccelerationVariation(a);
        }, 0) / recent.length;
        
        // Mapear variación de aceleración a velocidad estimada (heurística)
        if (avgVariation > 4.0) return 60; // Alta velocidad
        if (avgVariation > 2.0) return 35; // Velocidad media
        if (avgVariation > 1.0) return 15; // Velocidad baja
        return 5; // Velocidad muy baja
    }

    // Detección híbrida de eventos (GPS + Solo-Acelerómetro)
    detectEventsHybrid(data) {
        const events = [];
        const now = Date.now();
        
        // Solo detectar eventos si hay movimiento
        if (!this.isVehicleMoving) return events;
        
        const minTimeBetweenEvents = this.thresholds.stability_time;
        
        // 1. Aceleración brusca (mejorado)
        if (data.filtered_acceleration) {
            const longitudinal = data.longitudinal_acceleration || 
                                this.calculateInstantLongitudinal(data.filtered_acceleration);
            
            if (longitudinal > this.thresholds.harsh_acceleration) {
                if (!this.lastEventTime.harsh_acceleration || 
                    now - this.lastEventTime.harsh_acceleration > minTimeBetweenEvents) {
                    
                    events.push({
                        type: 'harsh_acceleration',
                        severity: this.calculateSeverity(longitudinal, this.thresholds.harsh_acceleration),
                        value: longitudinal,
                        method: data.detection_method,
                        timestamp: data.timestamp,
                        location: { lat: data.lat || null, lon: data.lon || null },
                        confidence: data.movement_confidence
                    });
                    
                    this.lastEventTime.harsh_acceleration = now;
                }
            }
        }

        // 2. Frenado brusco (mejorado)
        if (data.filtered_acceleration) {
            const longitudinal = data.longitudinal_acceleration || 
                                this.calculateInstantLongitudinal(data.filtered_acceleration);
            
            if (longitudinal < -this.thresholds.harsh_braking) {
                if (!this.lastEventTime.harsh_braking || 
                    now - this.lastEventTime.harsh_braking > minTimeBetweenEvents) {
                    
                    events.push({
                        type: 'harsh_braking',
                        severity: this.calculateSeverity(Math.abs(longitudinal), this.thresholds.harsh_braking),
                        value: Math.abs(longitudinal),
                        method: data.detection_method,
                        timestamp: data.timestamp,
                        location: { lat: data.lat || null, lon: data.lon || null },
                        confidence: data.movement_confidence
                    });
                    
                    this.lastEventTime.harsh_braking = now;
                }
            }
        }

        // 3. Giros agresivos (basado en aceleración lateral)
        if (data.filtered_acceleration) {
            const lateral = Math.abs(data.filtered_acceleration.x);
            
            if (lateral > this.thresholds.aggressive_turn) {
                if (!this.lastEventTime.aggressive_turn || 
                    now - this.lastEventTime.aggressive_turn > minTimeBetweenEvents) {
                    
                    events.push({
                        type: 'aggressive_turn',
                        severity: this.calculateSeverity(lateral, this.thresholds.aggressive_turn),
                        value: lateral,
                        direction: data.filtered_acceleration.x > 0 ? 'right' : 'left',
                        method: data.detection_method,
                        timestamp: data.timestamp,
                        location: { lat: data.lat || null, lon: data.lon || null },
                        confidence: data.movement_confidence
                    });
                    
                    this.lastEventTime.aggressive_turn = now;
                }
            }
        }

        // 4. Exceso de velocidad (solo si hay GPS)
        if (data.gps_available && data.velocidad) {
            const excess = data.velocidad - this.currentSpeedLimit;
            
            if (excess > this.thresholds.speeding) {
                if (!this.lastEventTime.speeding || 
                    now - this.lastEventTime.speeding > (minTimeBetweenEvents * 2)) {
                    
                    events.push({
                        type: 'speeding',
                        severity: this.calculateSpeedingSeverity(excess),
                        value: excess,
                        speed: data.velocidad,
                        limit: this.currentSpeedLimit,
                        method: data.detection_method,
                        timestamp: data.timestamp,
                        location: { lat: data.lat, lon: data.lon },
                        confidence: data.movement_confidence
                    });
                    
                    this.lastEventTime.speeding = now;
                }
            }
        }

        return events;
    }

    // NUEVA: Calcular aceleración longitudinal instantánea
    calculateInstantLongitudinal(filteredAccel) {
        // Usar componente Y como longitudinal (adelante/atrás)
        return filteredAccel.y || 0;
    }

    // Calcular aceleración longitudinal temporal
    calculateLongitudinalAcceleration(data) {
        if (this.dataBuffer.length === 0) return 0;
        
        const lastPoint = this.dataBuffer[this.dataBuffer.length - 1];
        const timeDelta = (new Date(data.timestamp) - new Date(lastPoint.timestamp)) / 1000;
        
        if (timeDelta <= 0) return 0;
        
        // Si tenemos velocidad GPS
        if (data.velocidad !== undefined && lastPoint.velocidad !== undefined) {
            return (data.velocidad - lastPoint.velocidad) / timeDelta / 3.6; // m/s²
        }
        
        // Si tenemos velocidad estimada
        if (data.estimated_speed !== undefined && lastPoint.estimated_speed !== undefined) {
            return (data.estimated_speed - lastPoint.estimated_speed) / timeDelta / 3.6; // m/s²
        }
        
        return 0;
    }

    // Verificar movimiento GPS
    hasGPSMovement(data) {
        if (!data.lat || !data.lon || !this.lastGPSPoint) {
            if (data.lat && data.lon) {
                this.lastGPSPoint = {
                    lat: data.lat,
                    lon: data.lon,
                    timestamp: Date.now()
                };
            }
            return false;
        }
        
        const distance = Utils.calculateDistance(
            this.lastGPSPoint.lat, this.lastGPSPoint.lon,
            data.lat, data.lon
        );
        
        const timeDiff = (Date.now() - this.lastGPSPoint.timestamp) / 1000;
        const calculatedSpeed = timeDiff > 0 ? (distance / timeDiff) * 3.6 : 0;
        
        this.lastGPSPoint = {
            lat: data.lat,
            lon: data.lon,
            timestamp: Date.now()
        };
        
        return calculatedSpeed > this.thresholds.gps_noise;
    }

    // Actualizar buffer
    updateBuffer(data) {
        this.dataBuffer.push(data);
        if (this.dataBuffer.length > this.bufferSize) {
            this.dataBuffer.shift();
        }
    }

    // Calcular severidad
    calculateSeverity(value, threshold) {
        const ratio = value / threshold;
        if (ratio >= 2.0) return 'extreme';
        if (ratio >= 1.5) return 'high';
        if (ratio >= 1.2) return 'moderate';
        return 'low';
    }

    calculateSpeedingSeverity(excess) {
        if (excess >= 40) return 'extreme';
        if (excess >= 30) return 'high';
        if (excess >= 20) return 'moderate';
        return 'low';
    }

    // Generar estadísticas mejoradas
    generateSessionStats(allData) {
        if (!allData || allData.length === 0) {
            return { error: 'No hay datos para analizar' };
        }

        const movingData = allData.filter(d => d.vehicle_moving);
        const gpsData = allData.filter(d => d.gps_available);
        const accelOnlyData = allData.filter(d => !d.gps_available && d.vehicle_moving);

        return {
            session_summary: {
                total_records: allData.length,
                moving_records: movingData.length,
                stationary_records: allData.length - movingData.length,
                gps_records: gpsData.length,
                accel_only_records: accelOnlyData.length,
                total_time_minutes: this.calculateTotalTime(allData) / 60000,
                average_confidence: this.calculateAverageConfidence(allData)
            },
            detection_methods: {
                gps_available_percent: ((gpsData.length / allData.length) * 100).toFixed(1) + '%',
                accel_only_percent: ((accelOnlyData.length / allData.length) * 100).toFixed(1) + '%',
                movement_detection_accuracy: ((movingData.length / allData.length) * 100).toFixed(1) + '%'
            },
            events_summary: {
                total_events: Object.values(this.eventCounters).reduce((a, b) => a + b, 0),
                harsh_acceleration: this.eventCounters.harsh_acceleration,
                harsh_braking: this.eventCounters.harsh_braking,
                aggressive_turns: this.eventCounters.aggressive_turn,
                speeding_events: this.eventCounters.speeding
            },
            field_performance: {
                events_per_minute: movingData.length > 0 ? 
                    (Object.values(this.eventCounters).reduce((a, b) => a + b, 0) / (this.calculateTotalTime(movingData) / 60000)).toFixed(2) : 0,
                detection_reliability: this.calculateDetectionReliability(allData)
            }
        };
    }

    calculateAverageConfidence(data) {
        if (data.length === 0) return 0;
        return (data.reduce((sum, d) => sum + (d.movement_confidence || 0), 0) / data.length).toFixed(1);
    }

    calculateDetectionReliability(data) {
        const movingData = data.filter(d => d.vehicle_moving);
        if (movingData.length === 0) return 'N/A';
        
        const avgConfidence = parseFloat(this.calculateAverageConfidence(movingData));
        
        if (avgConfidence >= 80) return 'Excelente';
        if (avgConfidence >= 60) return 'Buena';
        if (avgConfidence >= 40) return 'Aceptable';
        return 'Requiere mejora';
    }

    calculateTotalTime(data) {
        if (data.length < 2) return 0;
        const start = new Date(data[0].timestamp);
        const end = new Date(data[data.length - 1].timestamp);
        return end - start;
    }

    // Sistema de eventos
    addEventListener(eventType, callback) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType).push(callback);
    }

    emitEvent(eventType, data) {
        if (this.eventListeners.has(eventType)) {
            this.eventListeners.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    Utils.log('error', 'Error en callback de evento', error);
                }
            });
        }
    }

    // Resetear
    resetCounters() {
        Object.keys(this.eventCounters).forEach(key => {
            this.eventCounters[key] = 0;
        });
        this.dataBuffer = [];
        this.accelerationHistory = [];
        this.motionHistory = [];
        this.baselineAcceleration = null;
        this.lastGPSPoint = null;
        this.lastEventTime = {};
        this.isVehicleMoving = false;
        this.movementConfidence = 0;
    }

    getCurrentCounters() {
        return { ...this.eventCounters };
    }

    setThresholds(newThresholds) {
        this.thresholds = { ...this.thresholds, ...newThresholds };
        Utils.log('info', 'Umbrales FIELD-TESTED actualizados', this.thresholds);
    }
}

// Exportar para uso global
window.DataProcessor = DataProcessor;