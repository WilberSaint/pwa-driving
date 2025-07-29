// Gestor de Exportación - Monitor de Conducción ITSON v2.0
// Múltiples formatos y análisis estadístico

class ExportManager {
    constructor() {
        this.dataProcessor = null; // Se asignará desde la app principal
        this.alertManager = new AlertManager();
    }

    setDataProcessor(processor) {
        this.dataProcessor = processor;
    }

    // Exportar en formato JSON (datos completos)
    async exportJSON(data, participantId, groupType = 'unknown') {
        try {
            if (!data || data.length === 0) {
                throw new Error('No hay datos para exportar');
            }

            const exportData = this.generateCompleteExport(data, participantId, groupType);
            const filename = this.generateFilename(participantId, 'json');
            
            this.downloadFile(
                JSON.stringify(exportData, null, 2),
                filename,
                'application/json'
            );

            this.alertManager.success('✅ Datos exportados en formato JSON');
            Utils.log('info', `Datos JSON exportados: ${filename}`);
            
            return filename;

        } catch (error) {
            Utils.log('error', 'Error exportando JSON', error);
            this.alertManager.error('❌ Error al exportar JSON: ' + error.message);
            throw error;
        }
    }

    // Exportar en formato CSV (para análisis estadístico)
    async exportCSV(data, participantId, groupType = 'unknown') {
        try {
            if (!data || data.length === 0) {
                throw new Error('No hay datos para exportar');
            }

            const csvContent = this.generateCSV(data, participantId, groupType);
            const filename = this.generateFilename(participantId, 'csv');
            
            this.downloadFile(csvContent, filename, 'text/csv');

            this.alertManager.success('✅ Datos exportados en formato CSV');
            Utils.log('info', `Datos CSV exportados: ${filename}`);
            
            return filename;

        } catch (error) {
            Utils.log('error', 'Error exportando CSV', error);
            this.alertManager.error('❌ Error al exportar CSV: ' + error.message);
            throw error;
        }
    }

    // Exportar estadísticas resumidas
    async exportStatistics(data, participantId, groupType = 'unknown') {
        try {
            if (!data || data.length === 0) {
                throw new Error('No hay datos para exportar');
            }

            const stats = this.dataProcessor 
                ? this.dataProcessor.generateSessionStats(data)
                : this.generateBasicStats(data);
            
            const exportData = {
                participante: participantId,
                grupo: groupType,
                fecha: Utils.formatDateTime().date,
                estadisticas: stats,
                configuracion: {
                    umbrales: this.dataProcessor?.thresholds || {},
                    version: '2.0.0',
                    experimento: 'Patrones Conducción Agresiva ITSON'
                }
            };

            const filename = this.generateFilename(participantId, 'json', 'stats');
            
            this.downloadFile(
                JSON.stringify(exportData, null, 2),
                filename,
                'application/json'
            );

            this.alertManager.success('✅ Estadísticas exportadas');
            Utils.log('info', `Estadísticas exportadas: ${filename}`);
            
            return filename;

        } catch (error) {
            Utils.log('error', 'Error exportando estadísticas', error);
            this.alertManager.error('❌ Error al exportar estadísticas: ' + error.message);
            throw error;
        }
    }

    // Generar exportación completa
    generateCompleteExport(data, participantId, groupType) {
        const now = Utils.formatDateTime();
        const deviceInfo = Utils.getDeviceInfo();
        
        return {
            // Metadatos del experimento
            experimento: {
                titulo: "Detección de Patrones de Conducción Agresiva",
                institucion: "Instituto Tecnológico de Sonora (ITSON)",
                investigador: "Wilber Flores Preciado",
                version: "2.0.0",
                fecha_export: now.timestamp
            },

            // Información del participante
            participante: {
                id: participantId,
                grupo: groupType,
                fecha_sesion: now.date,
                duracion_sesion_min: this.calculateSessionDuration(data)
            },

            // Configuración técnica
            configuracion: {
                umbrales_deteccion: this.dataProcessor?.thresholds || {},
                frecuencia_muestreo: this.calculateSamplingRate(data),
                dispositivo: deviceInfo,
                sensores_utilizados: ['GPS', 'Acelerómetro']
            },

            // Estadísticas de la sesión
            estadisticas: this.dataProcessor 
                ? this.dataProcessor.generateSessionStats(data)
                : this.generateBasicStats(data),

            // Eventos detectados
            eventos_detectados: this.extractEvents(data),

            // Datos completos
            datos_raw: data,

            // Información de calidad
            calidad_datos: this.assessDataQuality(data),

            // Hash de verificación
            hash_verificacion: Utils.simpleHash(JSON.stringify(data))
        };
    }

    // Generar CSV optimizado para análisis estadístico
    generateCSV(data, participantId, groupType) {
        // Headers optimizados para análisis en R/SPSS/Excel
        const headers = [
            'participante_id',
            'grupo',
            'timestamp',
            'fecha_iso',
            'tiempo_sesion_seg',
            'latitud',
            'longitud',
            'velocidad_kmh',
            'aceleracion_x',
            'aceleracion_y', 
            'aceleracion_z',
            'aceleracion_magnitud',
            'aceleracion_longitudinal',
            'evento_aceleracion_brusca',
            'evento_frenado_brusco',
            'evento_giro_agresivo',
            'evento_exceso_velocidad',
            'contexto_conduccion',
            'limite_velocidad',
            'exceso_velocidad_kmh'
        ];

        let csvContent = headers.join(',') + '\n';
        
        const startTime = data.length > 0 ? new Date(data[0].timestamp) : new Date();

        data.forEach((row, index) => {
            const timestamp = new Date(row.timestamp);
            const sessionTime = Math.round((timestamp - startTime) / 1000);
            
            // Detectar eventos para esta fila
            const events = this.detectEventsForRow(row, data, index);
            
            const csvRow = [
                participantId,
                groupType,
                row.timestamp,
                timestamp.toISOString().split('T')[0],
                sessionTime,
                row.lat || '',
                row.lon || '',
                row.velocidad || '',
                row.x || '',
                row.y || '',
                row.z || '',
                row.acceleration_magnitude || this.calculateMagnitude(row),
                row.longitudinal_acceleration || '',
                events.harsh_acceleration ? 1 : 0,
                events.harsh_braking ? 1 : 0,
                events.aggressive_turn ? 1 : 0,
                events.speeding ? 1 : 0,
                row.driving_context || 'urban',
                row.speed_limit || 50,
                Math.max(0, (row.velocidad || 0) - (row.speed_limit || 50))
            ];

            csvContent += csvRow.map(field => 
                typeof field === 'string' && field.includes(',') ? `"${field}"` : field
            ).join(',') + '\n';
        });

        return csvContent;
    }

    // Detectar eventos para una fila específica (simplificado para CSV)
    detectEventsForRow(row, allData, index) {
        const events = {
            harsh_acceleration: false,
            harsh_braking: false,
            aggressive_turn: false,
            speeding: false
        };

        // Aceleración longitudinal
        if (row.longitudinal_acceleration) {
            if (row.longitudinal_acceleration > 2.5) {
                events.harsh_acceleration = true;
            }
            if (row.longitudinal_acceleration < -2.5) {
                events.harsh_braking = true;
            }
        }

        // Giro agresivo (lateral)
        if (row.x && Math.abs(row.x) > 4.0) {
            events.aggressive_turn = true;
        }

        // Exceso de velocidad
        const speedLimit = row.speed_limit || 50;
        if (row.velocidad && row.velocidad > speedLimit + 15) {
            events.speeding = true;
        }

        return events;
    }

    // Calcular magnitud de aceleración
    calculateMagnitude(row) {
        if (!row.x || !row.y || !row.z) return '';
        return Math.sqrt(row.x**2 + row.y**2 + row.z**2).toFixed(3);
    }

    // Generar estadísticas básicas cuando no hay DataProcessor
    generateBasicStats(data) {
        const validGPS = data.filter(d => d.lat && d.lon);
        const validSpeed = data.filter(d => d.velocidad && d.velocidad > 0);
        
        return {
            total_registros: data.length,
            registros_gps_validos: validGPS.length,
            velocidad_promedio: validSpeed.length > 0 
                ? (validSpeed.reduce((sum, d) => sum + d.velocidad, 0) / validSpeed.length).toFixed(1)
                : 0,
            velocidad_maxima: validSpeed.length > 0 
                ? Math.max(...validSpeed.map(d => d.velocidad)).toFixed(1)
                : 0,
            distancia_aproximada_km: this.calculateApproximateDistance(validGPS),
            duracion_total_min: this.calculateSessionDuration(data)
        };
    }

    // Calcular duración de la sesión
    calculateSessionDuration(data) {
        if (data.length < 2) return 0;
        const start = new Date(data[0].timestamp);
        const end = new Date(data[data.length - 1].timestamp);
        return Math.round((end - start) / 60000); // minutos
    }

    // Calcular frecuencia de muestreo
    calculateSamplingRate(data) {
        if (data.length < 10) return 'N/A';
        
        const intervals = [];
        for (let i = 1; i < Math.min(data.length, 100); i++) {
            const diff = new Date(data[i].timestamp) - new Date(data[i-1].timestamp);
            if (diff > 0) intervals.push(diff);
        }
        
        if (intervals.length === 0) return 'N/A';
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        return `${(1000 / avgInterval).toFixed(1)} Hz`;
    }

    // Extraer eventos detectados
    extractEvents(data) {
        // Esta función requiere que DataProcessor haya procesado los datos
        // Por simplicidad, retornamos un resumen básico
        return {
            nota: "Eventos extraídos del análisis en tiempo real",
            eventos_por_tipo: this.dataProcessor?.getCurrentCounters() || {},
            total_eventos: Object.values(this.dataProcessor?.getCurrentCounters() || {}).reduce((a, b) => a + b, 0)
        };
    }

    // Evaluar calidad de los datos
    assessDataQuality(data) {
        const totalRecords = data.length;
        const validGPS = data.filter(d => d.lat && d.lon).length;
        const validAccel = data.filter(d => d.x !== undefined && d.y !== undefined && d.z !== undefined).length;
        const validSpeed = data.filter(d => d.velocidad && d.velocidad >= 0).length;

        return {
            total_registros: totalRecords,
            gps_completitud: ((validGPS / totalRecords) * 100).toFixed(1) + '%',
            acelerometro_completitud: ((validAccel / totalRecords) * 100).toFixed(1) + '%',
            velocidad_completitud: ((validSpeed / totalRecords) * 100).toFixed(1) + '%',
            calidad_general: this.calculateOverallQuality(validGPS, validAccel, totalRecords),
            recomendaciones: this.generateQualityRecommendations(validGPS, validAccel, totalRecords)
        };
    }

    // Calcular calidad general
    calculateOverallQuality(validGPS, validAccel, total) {
        const gpsPercentage = (validGPS / total) * 100;
        const accelPercentage = (validAccel / total) * 100;
        const overall = (gpsPercentage + accelPercentage) / 2;

        if (overall >= 90) return 'Excelente';
        if (overall >= 75) return 'Buena';
        if (overall >= 60) return 'Aceptable';
        return 'Deficiente';
    }

    // Generar recomendaciones de calidad
    generateQualityRecommendations(validGPS, validAccel, total) {
        const recommendations = [];
        
        const gpsPercentage = (validGPS / total) * 100;
        const accelPercentage = (validAccel / total) * 100;

        if (gpsPercentage < 80) {
            recommendations.push('Verificar señal GPS - posible interferencia o ubicación interior');
        }
        
        if (accelPercentage < 90) {
            recommendations.push('Verificar posición del dispositivo - debe estar firmemente montado');
        }
        
        if (total < 100) {
            recommendations.push('Sesión muy corta - extender tiempo de grabación');
        }

        if (recommendations.length === 0) {
            recommendations.push('Calidad de datos óptima para análisis');
        }

        return recommendations;
    }

    // Calcular distancia aproximada
    calculateApproximateDistance(gpsData) {
        if (gpsData.length < 2) return 0;
        
        let totalDistance = 0;
        for (let i = 1; i < gpsData.length; i++) {
            const dist = Utils.calculateDistance(
                gpsData[i-1].lat, gpsData[i-1].lon,
                gpsData[i].lat, gpsData[i].lon
            );
            totalDistance += dist;
        }
        
        return (totalDistance / 1000).toFixed(2); // km
    }

    // Generar nombre de archivo
    generateFilename(participantId, extension, suffix = '') {
        const now = Utils.formatDateTime();
        const suffixPart = suffix ? `-${suffix}` : '';
        return `${participantId}-${now.filename}-conduccion${suffixPart}.${extension}`;
    }

    // Descargar archivo
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    // Generar reporte de exportación múltiple
    async exportAll(data, participantId, groupType = 'unknown') {
        try {
            this.alertManager.info('📦 Generando exportación completa...');
            
            const results = {
                json: null,
                csv: null, 
                stats: null,
                errors: []
            };

            // Exportar JSON
            try {
                results.json = await this.exportJSON(data, participantId, groupType);
            } catch (error) {
                results.errors.push(`JSON: ${error.message}`);
            }

            // Exportar CSV
            try {
                results.csv = await this.exportCSV(data, participantId, groupType);
            } catch (error) {
                results.errors.push(`CSV: ${error.message}`);
            }

            // Exportar estadísticas
            try {
                results.stats = await this.exportStatistics(data, participantId, groupType);
            } catch (error) {
                results.errors.push(`Stats: ${error.message}`);
            }

            // Resumen final
            const successful = [results.json, results.csv, results.stats].filter(Boolean).length;
            
            if (successful > 0) {
                this.alertManager.success(`✅ ${successful}/3 archivos exportados correctamente`);
            }
            
            if (results.errors.length > 0) {
                this.alertManager.warning(`⚠️ Errores: ${results.errors.join(', ')}`);
            }

            return results;

        } catch (error) {
            Utils.log('error', 'Error en exportación múltiple', error);
            this.alertManager.error('❌ Error en exportación múltiple');
            throw error;
        }
    }

    // Validar datos antes de exportar
    validateExportData(data, participantId) {
        const errors = [];

        if (!data || !Array.isArray(data)) {
            errors.push('Datos inválidos o no es un array');
        }

        if (data.length === 0) {
            errors.push('No hay datos para exportar');
        }

        if (!participantId || !Utils.validateParticipantId(participantId)) {
            errors.push('ID de participante inválido (usar formato P01, P02, etc.)');
        }

        // Verificar estructura básica de datos
        if (data.length > 0) {
            const sample = data[0];
            if (!Utils.validateDataStructure(sample)) {
                errors.push('Estructura de datos inválida');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // Generar reporte de preview antes de exportar
    generatePreview(data, participantId, groupType) {
        const validation = this.validateExportData(data, participantId);
        
        if (!validation.valid) {
            return {
                error: true,
                message: validation.errors.join(', ')
            };
        }

        const quality = this.assessDataQuality(data);
        const basicStats = this.generateBasicStats(data);

        return {
            error: false,
            preview: {
                participante: participantId,
                grupo: groupType,
                fecha: Utils.formatDateTime().date,
                total_registros: data.length,
                duracion_minutos: basicStats.duracion_total_min,
                distancia_km: basicStats.distancia_aproximada_km,
                calidad_datos: quality.calidad_general,
                velocidad_promedio: basicStats.velocidad_promedio,
                archivos_a_generar: ['JSON completo', 'CSV para análisis', 'Estadísticas resumidas']
            }
        };
    }
}

// Exportar para uso global
window.ExportManager = ExportManager;