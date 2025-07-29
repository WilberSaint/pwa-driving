// Procesador de Datos - Monitor de Conducción ITSON v2.0
// Detección de eventos de conducción agresiva en tiempo real

class DataProcessor {
    constructor() {
        // Umbrales basados en la literatura científica
        this.thresholds = {
            harsh_acceleration: 2.5,    // m/s² longitudinal
            harsh_braking: 2.5,         // m/s² longitudinal (negativo)
            aggressive_turn: 4.0,       // m/s² lateral
            speeding: 15,               // km/h sobre límite
            rapid_acceleration: 3.0,    // m/s² más estricto
            emergency_braking: 4.0      // m/s² frenado de emergencia
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
        this.bufferSize = 10; // Últimos 10 puntos de datos
        
        // Variables para cálculo de velocidad
        this.lastGPSPoint = null;
        this.speedHistory = [];
        
        // Variables para detección de patrones
        this.currentSpeed = 0;
        this.currentAcceleration = { x: 0, y: 0, z: 0 };
        
        // Límites de velocidad por defecto (pueden ser personalizados)
        this.speedLimits = {
            urban: 50,      // km/h
            highway: 110,   // km/h
            school: 30,     // km/h
            default: 50
        };
        
        this.currentSpeedLimit = this.speedLimits.default;
        
        // Sistema de eventos
        this.eventListeners = new Map();
        
        Utils.log('info', 'DataProcessor inicializado con umbrales', this.thresholds);
    }

    // Procesar nuevo punto de datos
    processDataPoint(rawData) {
        try {
            // Validar estructura de datos
            if (!Utils.validateDataStructure(rawData)) {
                Utils.log('warn', 'Estructura de datos inválida', rawData);
                return null;
            }

            // Enriquecer datos con análisis
            const processedData = this.enrichData(rawData);
            
            // Detectar eventos de conducción agresiva
            const events = this.detectDrivingEvents(processedData);
            
            // Actualizar buffer
            this.updateBuffer(processedData);
            
            // Actualizar contadores
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

            // Actualizar variables de estado
            this.updateCurrentState(processedData);
            
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

    // Enriquecer datos con cálculos adicionales
    enrichData(rawData) {
        const enriched = { ...rawData };
        const now = new Date(rawData.timestamp);

        // Calcular magnitud de aceleración
        if (rawData.x !== undefined && rawData.y !== undefined && rawData.z !== undefined) {
            enriched.acceleration_magnitude = Math.sqrt(
                rawData.x ** 2 + rawData.y ** 2 + rawData.z ** 2
            );
            
            // Aceleración sin gravedad (aproximada)
            enriched.linear_acceleration = {
                x: rawData.x,
                y: rawData.y,
                z: rawData.z - 9.81 // Restar gravedad aproximada
            };
        }

        // Calcular velocidad si no está disponible del GPS
        if (rawData.lat && rawData.lon && this.lastGPSPoint) {
            const timeDiff = now - new Date(this.lastGPSPoint.timestamp);
            if (timeDiff > 0) {
                const calculatedSpeed = Utils.calculateSpeed(
                    this.lastGPSPoint.lat,
                    this.lastGPSPoint.lon,
                    rawData.lat,
                    rawData.lon,
                    timeDiff
                );
                
                // Usar velocidad calculada si GPS no la proporciona
                if (!rawData.velocidad || rawData.velocidad === 0) {
                    enriched.velocidad = Math.max(0, calculatedSpeed);
                }
                
                enriched.calculated_speed = calculatedSpeed;
            }
        }

        // Actualizar último punto GPS
        if (rawData.lat && rawData.lon) {
            this.lastGPSPoint = {
                lat: rawData.lat,
                lon: rawData.lon,
                timestamp: rawData.timestamp
            };
        }

        // Calcular aceleración longitudinal y lateral
        if (this.dataBuffer.length > 0) {
            const lastPoint = this.dataBuffer[this.dataBuffer.length - 1];
            const timeDelta = (now - new Date(lastPoint.timestamp)) / 1000; // segundos
            
            if (timeDelta > 0 && enriched.velocidad !== undefined && lastPoint.velocidad !== undefined) {
                enriched.longitudinal_acceleration = (enriched.velocidad - lastPoint.velocidad) / timeDelta / 3.6; // m/s²
            }
        }

        // Determinar contexto de conducción
        enriched.driving_context = this.determineDrivingContext(enriched);
        
        // Actualizar límite de velocidad basado en contexto
        this.updateSpeedLimit(enriched.driving_context);
        enriched.speed_limit = this.currentSpeedLimit;
        
        return enriched;
    }

    // Detectar eventos de conducción agresiva
    detectDrivingEvents(data) {
        const events = [];
        const timestamp = data.timestamp;

        // 1. Detección de aceleración brusca (longitudinal)
        if (data.longitudinal_acceleration && data.longitudinal_acceleration > this.thresholds.harsh_acceleration) {
            events.push({
                type: 'harsh_acceleration',
                severity: this.calculateSeverity(data.longitudinal_acceleration, this.thresholds.harsh_acceleration),
                value: data.longitudinal_acceleration,
                timestamp: timestamp,
                location: { lat: data.lat, lon: data.lon }
            });
        }

        // 2. Detección de frenado brusco (longitudinal negativo)
        if (data.longitudinal_acceleration && data.longitudinal_acceleration < -this.thresholds.harsh_braking) {
            const severity = Math.abs(data.longitudinal_acceleration) > this.thresholds.emergency_braking ? 'emergency' : 'harsh';
            
            events.push({
                type: 'harsh_braking',
                severity: severity,
                value: Math.abs(data.longitudinal_acceleration),
                timestamp: timestamp,
                location: { lat: data.lat, lon: data.lon }
            });
        }

        // 3. Detección de giros agresivos (lateral)
        if (data.x !== undefined && Math.abs(data.x) > this.thresholds.aggressive_turn) {
            events.push({
                type: 'aggressive_turn',
                severity: this.calculateSeverity(Math.abs(data.x), this.thresholds.aggressive_turn),
                value: Math.abs(data.x),
                direction: data.x > 0 ? 'right' : 'left',
                timestamp: timestamp,
                location: { lat: data.lat, lon: data.lon }
            });
        }

        // 4. Detección de exceso de velocidad
        if (data.velocidad && data.velocidad > (this.currentSpeedLimit + this.thresholds.speeding)) {
            const excess = data.velocidad - this.currentSpeedLimit;
            events.push({
                type: 'speeding',
                severity: this.calculateSpeedingSeverity(excess),
                value: excess,
                speed: data.velocidad,
                limit: this.currentSpeedLimit,
                timestamp: timestamp,
                location: { lat: data.lat, lon: data.lon }
            });
        }

        // 5. Detección de patrones complejos
        const complexEvents = this.detectComplexPatterns(data);
        events.push(...complexEvents);

        return events;
    }

    // Detectar patrones complejos de conducción
    detectComplexPatterns(data) {
        const events = [];
        
        if (this.dataBuffer.length < 5) return events; // Necesitamos historial

        // Detección de zigzag/weaving
        const lateralChanges = this.detectZigzagPattern();
        if (lateralChanges) {
            events.push({
                type: 'zigzag_driving',
                severity: 'moderate',
                pattern: lateralChanges,
                timestamp: data.timestamp,
                location: { lat: data.lat, lon: data.lon }
            });
        }

        // Detección de aceleración/frenado repetitivo
        const pumpingPattern = this.detectPumpingPattern();
        if (pumpingPattern) {
            events.push({
                type: 'pumping_behavior',
                severity: 'moderate',
                pattern: pumpingPattern,
                timestamp: data.timestamp,
                location: { lat: data.lat, lon: data.lon }
            });
        }

        return events;
    }

    // Detectar patrón de zigzag
    detectZigzagPattern() {
        const lateralValues = this.dataBuffer.slice(-8).map(d => d.x || 0);
        let changes = 0;
        let lastDirection = null;

        for (let i = 1; i < lateralValues.length; i++) {
            const current = lateralValues[i];
            const direction = current > 0 ? 'right' : 'left';
            
            if (Math.abs(current) > 1.5 && lastDirection && direction !== lastDirection) {
                changes++;
            }
            
            if (Math.abs(current) > 1.5) {
                lastDirection = direction;
            }
        }

        return changes >= 4 ? { changes, frequency: changes / 8 } : null;
    }

    // Detectar patrón de aceleración/frenado repetitivo
    detectPumpingPattern() {
        if (this.dataBuffer.length < 6) return null;

        const accelerations = this.dataBuffer.slice(-6).map(d => d.longitudinal_acceleration || 0);
        let alternations = 0;
        let lastSign = null;

        for (const accel of accelerations) {
            if (Math.abs(accel) > 1.0) {
                const sign = accel > 0 ? 1 : -1;
                if (lastSign && sign !== lastSign) {
                    alternations++;
                }
                lastSign = sign;
            }
        }

        return alternations >= 3 ? { alternations, intensity: alternations / 6 } : null;
    }

    // Calcular severidad del evento
    calculateSeverity(value, threshold) {
        const ratio = value / threshold;
        if (ratio >= 2.0) return 'extreme';
        if (ratio >= 1.5) return 'high';
        if (ratio >= 1.2) return 'moderate';
        return 'low';
    }

    // Calcular severidad de exceso de velocidad
    calculateSpeedingSeverity(excess) {
        if (excess >= 30) return 'extreme';
        if (excess >= 20) return 'high';
        if (excess >= 10) return 'moderate';
        return 'low';
    }

    // Determinar contexto de conducción
    determineDrivingContext(data) {
        // Basado en velocidad y ubicación (simplificado)
        if (data.velocidad > 80) return 'highway';
        if (data.velocidad < 25) return 'urban_slow';
        return 'urban';
    }

    // Actualizar límite de velocidad
    updateSpeedLimit(context) {
        switch (context) {
            case 'highway':
                this.currentSpeedLimit = this.speedLimits.highway;
                break;
            case 'urban_slow':
                this.currentSpeedLimit = this.speedLimits.school;
                break;
            case 'urban':
            default:
                this.currentSpeedLimit = this.speedLimits.urban;
                break;
        }
    }

    // Actualizar buffer de datos
    updateBuffer(data) {
        this.dataBuffer.push(data);
        if (this.dataBuffer.length > this.bufferSize) {
            this.dataBuffer.shift();
        }
    }

    // Actualizar estado actual
    updateCurrentState(data) {
        this.currentSpeed = data.velocidad || 0;
        if (data.x !== undefined) {
            this.currentAcceleration = {
                x: data.x,
                y: data.y || 0,
                z: data.z || 0
            };
        }
    }

    // Generar estadísticas de la sesión
    generateSessionStats(allData) {
        if (!allData || allData.length === 0) {
            return {
                error: 'No hay datos para analizar'
            };
        }

        const totalDistance = this.calculateTotalDistance(allData);
        const totalTime = this.calculateTotalTime(allData);
        const eventsPerKm = this.calculateEventsPerKm(totalDistance);

        return {
            session_summary: {
                total_records: allData.length,
                total_distance_km: Utils.formatNumber(totalDistance / 1000, 2),
                total_time_minutes: Utils.formatNumber(totalTime / 60000, 1),
                average_speed: Utils.formatNumber(this.calculateAverageSpeed(allData), 1),
                max_speed: Utils.formatNumber(this.calculateMaxSpeed(allData), 1)
            },
            events_summary: {
                total_events: Object.values(this.eventCounters).reduce((a, b) => a + b, 0),
                harsh_acceleration: this.eventCounters.harsh_acceleration,
                harsh_braking: this.eventCounters.harsh_braking,
                aggressive_turns: this.eventCounters.aggressive_turn,
                speeding_events: this.eventCounters.speeding
            },
            events_per_km: eventsPerKm,
            risk_assessment: this.calculateRiskScore(eventsPerKm, totalDistance),
            recommendations: this.generateRecommendations(eventsPerKm)
        };
    }

    // Calcular distancia total
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

    // Calcular tiempo total
    calculateTotalTime(data) {
        if (data.length < 2) return 0;
        
        const start = new Date(data[0].timestamp);
        const end = new Date(data[data.length - 1].timestamp);
        return end - start;
    }

    // Calcular eventos por kilómetro
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

    // Calcular velocidad promedio
    calculateAverageSpeed(data) {
        const speeds = data.filter(d => d.velocidad && d.velocidad > 0).map(d => d.velocidad);
        return speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    }

    // Calcular velocidad máxima
    calculateMaxSpeed(data) {
        const speeds = data.filter(d => d.velocidad).map(d => d.velocidad);
        return speeds.length > 0 ? Math.max(...speeds) : 0;
    }

    // Calcular puntuación de riesgo
    calculateRiskScore(eventsPerKm, totalDistance) {
        const totalEventsPerKm = parseFloat(eventsPerKm.total_events_per_km || 0);
        
        let risk = 'low';
        let score = 0;

        if (totalEventsPerKm > 5) {
            risk = 'high';
            score = 80 + Math.min(totalEventsPerKm * 2, 20);
        } else if (totalEventsPerKm > 2) {
            risk = 'moderate';
            score = 40 + totalEventsPerKm * 10;
        } else {
            risk = 'low';
            score = totalEventsPerKm * 20;
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
                return 'Patrón de conducción agresiva detectado. Se recomienda modificar comportamiento.';
            case 'moderate':
                return 'Algunos eventos de conducción agresiva detectados. Área de mejora identificada.';
            case 'low':
            default:
                return 'Patrón de conducción seguro. Continuar con buenas prácticas.';
        }
    }

    // Generar recomendaciones
    generateRecommendations(eventsPerKm) {
        const recommendations = [];
        
        if (parseFloat(eventsPerKm.harsh_acceleration_per_km || 0) > 1) {
            recommendations.push('Reducir aceleraciones bruscas. Acelerar gradualmente.');
        }
        
        if (parseFloat(eventsPerKm.harsh_braking_per_km || 0) > 1) {
            recommendations.push('Mantener mayor distancia de seguimiento para evitar frenadas bruscas.');
        }
        
        if (parseFloat(eventsPerKm.aggressive_turns_per_km || 0) > 0.5) {
            recommendations.push('Reducir velocidad en curvas y giros.');
        }
        
        if (parseFloat(eventsPerKm.speeding_per_km || 0) > 0.5) {
            recommendations.push('Respetar límites de velocidad establecidos.');
        }

        if (recommendations.length === 0) {
            recommendations.push('Excelente conducción. Mantener comportamiento seguro.');
        }

        return recommendations;
    }

    // Sistema de eventos
    addEventListener(eventType, callback) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType).push(callback);
    }

    removeEventListener(eventType, callback) {
        if (this.eventListeners.has(eventType)) {
            const callbacks = this.eventListeners.get(eventType);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
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
    }

    // Obtener contadores actuales
    getCurrentCounters() {
        return { ...this.eventCounters };
    }

    // Configurar umbrales personalizados
    setThresholds(newThresholds) {
        this.thresholds = { ...this.thresholds, ...newThresholds };
        Utils.log('info', 'Umbrales actualizados', this.thresholds);
    }

    // Configurar límites de velocidad personalizados
    setSpeedLimits(newLimits) {
        this.speedLimits = { ...this.speedLimits, ...newLimits };
        Utils.log('info', 'Límites de velocidad actualizados', this.speedLimits);
    }
}

// Exportar para uso global
window.DataProcessor = DataProcessor;