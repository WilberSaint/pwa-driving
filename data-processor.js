// Procesador de Datos CALIBRADO - Monitor de Conducción ITSON v2.1
// Ajustado para condiciones reales de Sinaloa, México

class DataProcessor {
    constructor() {
        // Umbrales CALIBRADOS para reducir falsos positivos
        this.thresholds = {
            // Aceleración - más estrictos para evitar ruido del motor
            harsh_acceleration: 3.5,    // Era 2.5, ahora 3.5 m/s²
            harsh_braking: 3.5,         // Era 2.5, ahora 3.5 m/s²
            aggressive_turn: 5.5,       // Era 4.0, ahora 5.5 m/s²
            
            // Velocidad - ajustado para México
            speeding: 20,               // Era 15, ahora 20 km/h sobre límite
            minimum_speed: 5,           // Velocidad mínima para detectar eventos (5 km/h)
            
            // Filtros anti-ruido
            acceleration_noise: 1.0,    // Filtrar vibraciones <1.0 m/s²
            gps_noise: 2.0,            // Filtrar cambios GPS <2 km/h
            stability_time: 3000       // 3 segundos para confirmar evento
        };

        // Contadores de eventos
        this.eventCounters = {
            harsh_acceleration: 0,
            harsh_braking: 0,
            aggressive_turn: 0,
            speeding: 0
        };

        // Buffer para análisis temporal Y FILTRADO
        this.dataBuffer = [];
        this.bufferSize = 5; // Reducido de 10 a 5 para menos memoria
        
        // Variables para filtrado de ruido
        this.lastGPSPoint = null;
        this.speedHistory = [];
        this.accelerationHistory = [];
        this.lastEventTime = {};
        
        // Control de frecuencia de grabación
        this.lastRecordTime = 0;
        this.recordInterval = 2000; // 2 segundos entre registros (era 1 segundo)
        
        // Variables para detección de movimiento real
        this.isVehicleMoving = false;
        this.movementConfidence = 0;
        
        // Límites de velocidad para Sinaloa
        this.speedLimits = {
            urban: 60,      // Ciudades de Sinaloa
            highway: 110,   // Carreteras
            residential: 40, // Zonas residenciales
            school: 20,     // Zonas escolares
            default: 60
        };
        
        this.currentSpeedLimit = this.speedLimits.default;
        
        // Sistema de eventos
        this.eventListeners = new Map();
        
        Utils.log('info', 'DataProcessor CALIBRADO inicializado', this.thresholds);
    }

    // Procesar nuevo punto de datos CON FILTRADO
    processDataPoint(rawData) {
        try {
            // FILTRO 1: Control de frecuencia
            const now = Date.now();
            if (now - this.lastRecordTime < this.recordInterval) {
                return null; // Descartar registros muy frecuentes
            }
            this.lastRecordTime = now;

            // FILTRO 2: Validar estructura de datos
            if (!Utils.validateDataStructure(rawData)) {
                Utils.log('warn', 'Estructura de datos inválida', rawData);
                return null;
            }

            // FILTRO 3: Detectar si el vehículo está realmente en movimiento
            this.updateMovementDetection(rawData);
            
            // Si no hay movimiento real, solo guardar datos básicos sin eventos
            if (!this.isVehicleMoving) {
                const basicData = this.enrichBasicData(rawData);
                this.updateBuffer(basicData);
                return {
                    processed: basicData,
                    events: [], // Sin eventos si no hay movimiento
                    counters: this.eventCounters
                };
            }

            // FILTRO 4: Enriquecer datos con análisis
            const processedData = this.enrichData(rawData);
            
            // FILTRO 5: Detectar eventos SOLO si hay movimiento real
            const events = this.detectDrivingEventsFiltered(processedData);
            
            // Actualizar buffer
            this.updateBuffer(processedData);
            
            // Actualizar contadores solo con eventos válidos
            events.forEach(event => {
                if (this.eventCounters.hasOwnProperty(event.type)) {
                    this.eventCounters[event.type]++;
                }
                
                // Emitir evento para la UI
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

    // Detectar movimiento real del vehículo
    updateMovementDetection(rawData) {
        const speed = rawData.velocidad || 0;
        const hasAcceleration = rawData.x !== undefined && rawData.y !== undefined && rawData.z !== undefined;
        
        // Criterios para considerar que hay movimiento real
        const speedCriteria = speed > this.thresholds.minimum_speed;
        const accelerationVariation = hasAcceleration ? this.hasSignificantAcceleration(rawData) : false;
        const gpsMovement = this.hasGPSMovement(rawData);
        
        // Calcular confianza de movimiento (0-100)
        let confidence = 0;
        if (speedCriteria) confidence += 40;
        if (accelerationVariation) confidence += 30;
        if (gpsMovement) confidence += 30;
        
        this.movementConfidence = confidence;
        this.isVehicleMoving = confidence > 50; // 50% confianza mínima
        
        // Log para debugging
        if (this.isVehicleMoving !== this.wasMoving) {
            Utils.log('info', `Movimiento detectado: ${this.isVehicleMoving}`, {
                speed: speed,
                confidence: confidence,
                criteria: { speedCriteria, accelerationVariation, gpsMovement }
            });
            this.wasMoving = this.isVehicleMoving;
        }
    }

    // Verificar si hay aceleración significativa (no ruido)
    hasSignificantAcceleration(data) {
        if (!data.x || !data.y || !data.z) return false;
        
        // Calcular variación respecto al último registro
        if (this.accelerationHistory.length > 0) {
            const last = this.accelerationHistory[this.accelerationHistory.length - 1];
            const variation = Math.sqrt(
                Math.pow(data.x - last.x, 2) + 
                Math.pow(data.y - last.y, 2) + 
                Math.pow(data.z - last.z, 2)
            );
            
            // Mantener historial de aceleración
            this.accelerationHistory.push({ x: data.x, y: data.y, z: data.z });
            if (this.accelerationHistory.length > 5) {
                this.accelerationHistory.shift();
            }
            
            return variation > this.thresholds.acceleration_noise;
        }
        
        this.accelerationHistory.push({ x: data.x, y: data.y, z: data.z });
        return false;
    }

    // Verificar movimiento GPS real
    hasGPSMovement(data) {
        if (!data.lat || !data.lon || !this.lastGPSPoint) return false;
        
        const distance = Utils.calculateDistance(
            this.lastGPSPoint.lat, this.lastGPSPoint.lon,
            data.lat, data.lon
        );
        
        const timeDiff = (Date.now() - this.lastGPSPoint.timestamp) / 1000; // segundos
        const calculatedSpeed = (distance / timeDiff) * 3.6; // km/h
        
        this.lastGPSPoint = {
            lat: data.lat,
            lon: data.lon,
            timestamp: Date.now()
        };
        
        return calculatedSpeed > this.thresholds.gps_noise;
    }

    // Enriquecimiento básico sin procesamiento complejo
    enrichBasicData(rawData) {
        const enriched = { ...rawData };
        
        // Solo cálculos básicos
        if (rawData.x !== undefined && rawData.y !== undefined && rawData.z !== undefined) {
            enriched.acceleration_magnitude = Math.sqrt(
                rawData.x ** 2 + rawData.y ** 2 + rawData.z ** 2
            );
        }
        
        enriched.vehicle_moving = this.isVehicleMoving;
        enriched.movement_confidence = this.movementConfidence;
        
        return enriched;
    }

    // Enriquecer datos CON FILTROS
    enrichData(rawData) {
        const enriched = { ...rawData };
        const now = new Date(rawData.timestamp);

        // Calcular magnitud de aceleración
        if (rawData.x !== undefined && rawData.y !== undefined && rawData.z !== undefined) {
            enriched.acceleration_magnitude = Math.sqrt(
                rawData.x ** 2 + rawData.y ** 2 + rawData.z ** 2
            );
            
            // Aceleración lineal filtrada (removiendo ruido)
            enriched.filtered_acceleration = {
                x: Math.abs(rawData.x) > this.thresholds.acceleration_noise ? rawData.x : 0,
                y: Math.abs(rawData.y) > this.thresholds.acceleration_noise ? rawData.y : 0,
                z: Math.abs(rawData.z) > this.thresholds.acceleration_noise ? rawData.z : 0
            };
        }

        // Velocidad filtrada
        if (rawData.velocidad !== undefined) {
            // Mantener historial de velocidad para filtrado
            this.speedHistory.push(rawData.velocidad);
            if (this.speedHistory.length > 5) {
                this.speedHistory.shift();
            }
            
            // Velocidad promedio de los últimos 5 registros
            enriched.filtered_speed = this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
        }

        // Calcular aceleración longitudinal FILTRADA
        if (this.dataBuffer.length > 0 && enriched.filtered_speed !== undefined) {
            const lastPoint = this.dataBuffer[this.dataBuffer.length - 1];
            const timeDelta = (now - new Date(lastPoint.timestamp)) / 1000; // segundos
            
            if (timeDelta > 0 && lastPoint.filtered_speed !== undefined) {
                const deltaSpeed = enriched.filtered_speed - lastPoint.filtered_speed;
                enriched.longitudinal_acceleration = (deltaSpeed / timeDelta) / 3.6; // m/s²
            }
        }

        // Contexto de conducción para Sinaloa
        enriched.driving_context = this.determineDrivingContextSinaloa(enriched);
        this.updateSpeedLimit(enriched.driving_context);
        enriched.speed_limit = this.currentSpeedLimit;
        
        // Metadatos de filtrado
        enriched.vehicle_moving = this.isVehicleMoving;
        enriched.movement_confidence = this.movementConfidence;
        
        return enriched;
    }

    // Detectar eventos CON FILTROS ANTI-RUIDO
    detectDrivingEventsFiltered(data) {
        const events = [];
        const timestamp = data.timestamp;
        const now = Date.now();

        // FILTRO: Solo detectar eventos si hay movimiento real y velocidad mínima
        if (!this.isVehicleMoving || (data.filtered_speed || 0) < this.thresholds.minimum_speed) {
            return events;
        }

        // FILTRO: Evitar eventos duplicados muy cercanos en tiempo
        const minTimeBetweenEvents = this.thresholds.stability_time;

        // 1. Aceleración brusca FILTRADA
        if (data.longitudinal_acceleration && data.longitudinal_acceleration > this.thresholds.harsh_acceleration) {
            if (!this.lastEventTime.harsh_acceleration || 
                now - this.lastEventTime.harsh_acceleration > minTimeBetweenEvents) {
                
                events.push({
                    type: 'harsh_acceleration',
                    severity: this.calculateSeverity(data.longitudinal_acceleration, this.thresholds.harsh_acceleration),
                    value: data.longitudinal_acceleration,
                    timestamp: timestamp,
                    location: { lat: data.lat, lon: data.lon },
                    speed: data.filtered_speed,
                    confidence: this.movementConfidence
                });
                
                this.lastEventTime.harsh_acceleration = now;
            }
        }

        // 2. Frenado brusco FILTRADO
        if (data.longitudinal_acceleration && data.longitudinal_acceleration < -this.thresholds.harsh_braking) {
            if (!this.lastEventTime.harsh_braking || 
                now - this.lastEventTime.harsh_braking > minTimeBetweenEvents) {
                
                events.push({
                    type: 'harsh_braking',
                    severity: this.calculateSeverity(Math.abs(data.longitudinal_acceleration), this.thresholds.harsh_braking),
                    value: Math.abs(data.longitudinal_acceleration),
                    timestamp: timestamp,
                    location: { lat: data.lat, lon: data.lon },
                    speed: data.filtered_speed,
                    confidence: this.movementConfidence
                });
                
                this.lastEventTime.harsh_braking = now;
            }
        }

        // 3. Giros agresivos FILTRADOS (solo con velocidad >15 km/h)
        if (data.filtered_acceleration && data.filtered_speed > 15) {
            const lateralG = Math.abs(data.filtered_acceleration.x);
            
            if (lateralG > this.thresholds.aggressive_turn) {
                if (!this.lastEventTime.aggressive_turn || 
                    now - this.lastEventTime.aggressive_turn > minTimeBetweenEvents) {
                    
                    events.push({
                        type: 'aggressive_turn',
                        severity: this.calculateSeverity(lateralG, this.thresholds.aggressive_turn),
                        value: lateralG,
                        direction: data.filtered_acceleration.x > 0 ? 'right' : 'left',
                        timestamp: timestamp,
                        location: { lat: data.lat, lon: data.lon },
                        speed: data.filtered_speed,
                        confidence: this.movementConfidence
                    });
                    
                    this.lastEventTime.aggressive_turn = now;
                }
            }
        }

        // 4. Exceso de velocidad (solo con velocidad >30 km/h)
        if (data.filtered_speed && data.filtered_speed > 30) {
            const excess = data.filtered_speed - this.currentSpeedLimit;
            
            if (excess > this.thresholds.speeding) {
                if (!this.lastEventTime.speeding || 
                    now - this.lastEventTime.speeding > (minTimeBetweenEvents * 3)) { // Más tiempo para speeding
                    
                    events.push({
                        type: 'speeding',
                        severity: this.calculateSpeedingSeverity(excess),
                        value: excess,
                        speed: data.filtered_speed,
                        limit: this.currentSpeedLimit,
                        timestamp: timestamp,
                        location: { lat: data.lat, lon: data.lon },
                        confidence: this.movementConfidence
                    });
                    
                    this.lastEventTime.speeding = now;
                }
            }
        }

        return events;
    }

    // Contexto de conducción específico para Sinaloa
    determineDrivingContextSinaloa(data) {
        const speed = data.filtered_speed || 0;
        
        // Basado en velocidades típicas en Sinaloa
        if (speed > 90) return 'highway';      // Carreteras/autopistas
        if (speed > 50) return 'urban_fast';   // Avenidas principales
        if (speed > 20) return 'urban';        // Calles urbanas
        if (speed > 5) return 'residential';   // Zonas residenciales
        return 'stationary';                   // Detenido
    }

    // Actualizar límites de velocidad para Sinaloa
    updateSpeedLimit(context) {
        switch (context) {
            case 'highway':
                this.currentSpeedLimit = this.speedLimits.highway;
                break;
            case 'urban_fast':
                this.currentSpeedLimit = 70; // Avenidas rápidas
                break;
            case 'residential':
                this.currentSpeedLimit = this.speedLimits.residential;
                break;
            case 'urban':
            default:
                this.currentSpeedLimit = this.speedLimits.urban;
                break;
        }
    }

    // Calcular severidad del evento
    calculateSeverity(value, threshold) {
        const ratio = value / threshold;
        if (ratio >= 2.5) return 'extreme';
        if (ratio >= 2.0) return 'high';
        if (ratio >= 1.5) return 'moderate';
        return 'low';
    }

    // Calcular severidad de exceso de velocidad
    calculateSpeedingSeverity(excess) {
        if (excess >= 40) return 'extreme';
        if (excess >= 30) return 'high';
        if (excess >= 20) return 'moderate';
        return 'low';
    }

    // Actualizar buffer con límite de memoria
    updateBuffer(data) {
        this.dataBuffer.push(data);
        if (this.dataBuffer.length > this.bufferSize) {
            this.dataBuffer.shift();
        }
    }

    // Generar estadísticas de la sesión FILTRADAS
    generateSessionStats(allData) {
        if (!allData || allData.length === 0) {
            return { error: 'No hay datos para analizar' };
        }

        // Filtrar solo datos con movimiento real
        const movingData = allData.filter(d => d.vehicle_moving);
        const totalDistance = this.calculateTotalDistance(allData);
        const totalTime = this.calculateTotalTime(allData);
        const movingTime = this.calculateTotalTime(movingData);

        return {
            session_summary: {
                total_records: allData.length,
                moving_records: movingData.length,
                stationary_records: allData.length - movingData.length,
                total_distance_km: Utils.formatNumber(totalDistance / 1000, 2),
                total_time_minutes: Utils.formatNumber(totalTime / 60000, 1),
                moving_time_minutes: Utils.formatNumber(movingTime / 60000, 1),
                average_speed: Utils.formatNumber(this.calculateAverageSpeed(movingData), 1),
                max_speed: Utils.formatNumber(this.calculateMaxSpeed(allData), 1)
            },
            events_summary: {
                total_events: Object.values(this.eventCounters).reduce((a, b) => a + b, 0),
                harsh_acceleration: this.eventCounters.harsh_acceleration,
                harsh_braking: this.eventCounters.harsh_braking,
                aggressive_turns: this.eventCounters.aggressive_turn,
                speeding_events: this.eventCounters.speeding
            },
            events_per_km: this.calculateEventsPerKm(totalDistance),
            data_quality: {
                movement_detection_accuracy: Utils.formatNumber((movingData.length / allData.length) * 100, 1) + '%',
                average_confidence: Utils.formatNumber(
                    allData.reduce((sum, d) => sum + (d.movement_confidence || 0), 0) / allData.length, 1
                ) + '%'
            },
            risk_assessment: this.calculateRiskScore(this.calculateEventsPerKm(totalDistance), totalDistance)
        };
    }

    // Métodos auxiliares (sin cambios significativos)
    calculateTotalDistance(data) {
        let totalDistance = 0;
        let lastPoint = null;

        for (const point of data) {
            if (point.lat && point.lon) {
                if (lastPoint) {
                    totalDistance += Utils.calculateDistance(
                        lastPoint.lat, lastPoint.lon,
                        point.lat, point.lon
                    );
                }
                lastPoint = point;
            }
        }

        return totalDistance;
    }

    calculateTotalTime(data) {
        if (data.length < 2) return 0;
        
        const start = new Date(data[0].timestamp);
        const end = new Date(data[data.length - 1].timestamp);
        return end - start;
    }

    calculateEventsPerKm(totalDistanceMeters) {
        const totalKm = totalDistanceMeters / 1000;
        if (totalKm === 0) return {};

        return {
            harsh_acceleration_per_km: Utils.formatNumber(this.eventCounters.harsh_acceleration / totalKm, 2),
            harsh_braking_per_km: Utils.formatNumber(this.eventCounters.harsh_braking / totalKm, 2),
            aggressive_turns_per_km: Utils.formatNumber(this.eventCounters.aggressive_turn / totalKm, 2),
            speeding_per_km: Utils.formatNumber(this.eventCounters.speeding / totalKm, 2),
            total_events_per_km: Utils.formatNumber(Object.values(this.eventCounters).reduce((a, b) => a + b, 0) / totalKm, 2)
        };
    }

    calculateAverageSpeed(data) {
        const speeds = data.filter(d => d.filtered_speed > 5).map(d => d.filtered_speed);
        return speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    }

    calculateMaxSpeed(data) {
        const speeds = data.filter(d => d.velocidad).map(d => d.velocidad);
        return speeds.length > 0 ? Math.max(...speeds) : 0;
    }

    calculateRiskScore(eventsPerKm, totalDistance) {
        const totalEventsPerKm = parseFloat(eventsPerKm.total_events_per_km || 0);
        
        let risk = 'low';
        let score = 0;

        // Ajustado para condiciones mexicanas
        if (totalEventsPerKm > 3) {
            risk = 'high';
            score = 70 + Math.min(totalEventsPerKm * 5, 30);
        } else if (totalEventsPerKm > 1) {
            risk = 'moderate';
            score = 30 + totalEventsPerKm * 20;
        } else {
            risk = 'low';
            score = totalEventsPerKm * 30;
        }

        return {
            level: risk,
            score: Math.round(score),
            description: this.getRiskDescription(risk)
        };
    }

    getRiskDescription(risk) {
        switch (risk) {
            case 'high':
                return 'Patrón de conducción agresiva detectado. Revisar técnicas de manejo.';
            case 'moderate':
                return 'Algunos eventos detectados. Oportunidad de mejora identificada.';
            case 'low':
            default:
                return 'Patrón de conducción seguro. Excelente desempeño.';
        }
    }

    // Sistema de eventos (sin cambios)
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

    // Resetear contadores
    resetCounters() {
        Object.keys(this.eventCounters).forEach(key => {
            this.eventCounters[key] = 0;
        });
        this.dataBuffer = [];
        this.lastGPSPoint = null;
        this.accelerationHistory = [];
        this.speedHistory = [];
        this.lastEventTime = {};
        this.isVehicleMoving = false;
        this.movementConfidence = 0;
    }

    getCurrentCounters() {
        return { ...this.eventCounters };
    }

    setThresholds(newThresholds) {
        this.thresholds = { ...this.thresholds, ...newThresholds };
        Utils.log('info', 'Umbrales actualizados para Sinaloa', this.thresholds);
    }
}

// Exportar para uso global
window.DataProcessor = DataProcessor;