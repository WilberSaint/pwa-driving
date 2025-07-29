// Utilidades - Monitor de Conducción ITSON v2.0
// Funciones auxiliares y helpers

class Utils {
    // Formatear fecha y hora
    static formatDateTime(date = new Date()) {
        return {
            date: date.toISOString().split('T')[0],
            time: date.toLocaleTimeString('es-MX', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }),
            timestamp: date.toISOString(),
            filename: date.toISOString().replace(/[:.]/g, '-').split('T')[0]
        };
    }

    // Formatear duración en HH:MM:SS
    static formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Calcular distancia entre dos puntos GPS (fórmula de Haversine)
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Radio de la Tierra en metros
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // Distancia en metros
    }

    // Calcular velocidad entre dos puntos
    static calculateSpeed(lat1, lon1, lat2, lon2, timeDiff) {
        const distance = this.calculateDistance(lat1, lon1, lat2, lon2);
        const speedMs = distance / (timeDiff / 1000); // m/s
        return speedMs * 3.6; // Convertir a km/h
    }

    // Validar precisión GPS
    static validateGPSAccuracy(accuracy) {
        if (accuracy <= 3) return 'excellent';
        if (accuracy <= 5) return 'good';
        if (accuracy <= 10) return 'fair';
        return 'poor';
    }

    // Detectar tipo de dispositivo
    static getDeviceInfo() {
        const ua = navigator.userAgent;
        return {
            isIOS: /iPad|iPhone|iPod/.test(ua),
            isAndroid: /Android/.test(ua),
            isMobile: /Mobi|Android/i.test(ua),
            browser: this.getBrowserName(),
            platform: navigator.platform,
            language: navigator.language
        };
    }

    static getBrowserName() {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edge')) return 'Edge';
        return 'Unknown';
    }

    // Verificar capacidades del navegador
    static checkBrowserCapabilities() {
        return {
            geolocation: 'geolocation' in navigator,
            deviceMotion: 'DeviceMotionEvent' in window,
            deviceOrientation: 'DeviceOrientationEvent' in window,
            serviceWorker: 'serviceWorker' in navigator,
            localStorage: typeof Storage !== 'undefined',
            indexedDB: 'indexedDB' in window,
            wakeLock: 'wakeLock' in navigator,
            batteryAPI: 'getBattery' in navigator,
            networkInfo: 'connection' in navigator
        };
    }

    // Obtener información de batería
    static async getBatteryInfo() {
        try {
            if ('getBattery' in navigator) {
                const battery = await navigator.getBattery();
                return {
                    level: Math.round(battery.level * 100),
                    charging: battery.charging,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime
                };
            }
        } catch (error) {
            console.log('Battery API no disponible');
        }
        return null;
    }

    // Obtener información de almacenamiento
    static async getStorageInfo() {
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate();
                const used = estimate.usage || 0;
                const total = estimate.quota || 0;
                const available = total - used;
                
                return {
                    used: Math.round(used / 1024 / 1024), // MB
                    total: Math.round(total / 1024 / 1024), // MB
                    available: Math.round(available / 1024 / 1024), // MB
                    percentage: Math.round((used / total) * 100)
                };
            }
        } catch (error) {
            console.log('Storage API no disponible');
        }
        return null;
    }

    // Generar ID único para registros
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Validar ID de participante
    static validateParticipantId(id) {
        const regex = /^P\d{2}$/; // Formato P01, P02, etc.
        return regex.test(id);
    }

    // Limpiar y validar datos de entrada
    static sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.trim()
                   .replace(/[<>]/g, '') // Remover caracteres peligrosos
                   .substring(0, 50); // Limitar longitud
    }

    // Detectar orientación del dispositivo
    static getDeviceOrientation() {
        if (screen.orientation) {
            return screen.orientation.angle;
        } else if (window.orientation !== undefined) {
            return window.orientation;
        }
        return 0;
    }

    // Verificar si el dispositivo está en movimiento
    static isDeviceMoving(accelData, threshold = 0.5) {
        const magnitude = Math.sqrt(
            accelData.x * accelData.x + 
            accelData.y * accelData.y + 
            accelData.z * accelData.z
        );
        return magnitude > threshold;
    }

    // Formatear números con decimales
    static formatNumber(num, decimals = 2) {
        if (isNaN(num)) return '0';
        return parseFloat(num).toFixed(decimals);
    }

    // Convertir bytes a formato legible
    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Debounce para funciones que se ejecutan frecuentemente
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle para limitar frecuencia de ejecución
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Generar hash simple para verificar integridad de datos
    static simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convertir a 32 bits
        }
        return Math.abs(hash).toString(36);
    }

    // Verificar conectividad
    static checkConnectivity() {
        return {
            online: navigator.onLine,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt
            } : null
        };
    }

    // Obtener información de ubicación aproximada (sin GPS)
    static async getApproximateLocation() {
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            return {
                city: data.city,
                region: data.region,
                country: data.country_name,
                timezone: data.timezone
            };
        } catch (error) {
            console.log('No se pudo obtener ubicación aproximada');
            return null;
        }
    }

    // Validar estructura de datos
    static validateDataStructure(data) {
        const requiredFields = ['timestamp', 'participante'];
        const optionalFields = ['lat', 'lon', 'velocidad', 'x', 'y', 'z'];
        
        if (!data || typeof data !== 'object') return false;
        
        // Verificar campos requeridos
        for (const field of requiredFields) {
            if (!(field in data)) return false;
        }
        
        // Verificar tipos de datos
        if (typeof data.timestamp !== 'string') return false;
        if (typeof data.participante !== 'string') return false;
        
        return true;
    }

    // Logger mejorado con niveles
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        
        switch (level) {
            case 'error':
                console.error(prefix, message, data);
                break;
            case 'warn':
                console.warn(prefix, message, data);
                break;
            case 'info':
                console.info(prefix, message, data);
                break;
            default:
                console.log(prefix, message, data);
        }
        
        // Guardar logs importantes en localStorage
        if (level === 'error' || level === 'warn') {
            this.saveLog(level, message, data);
        }
    }

    static saveLog(level, message, data) {
        try {
            const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
            logs.push({
                timestamp: new Date().toISOString(),
                level,
                message,
                data: data ? JSON.stringify(data) : null
            });
            
            // Mantener solo los últimos 100 logs
            if (logs.length > 100) {
                logs.splice(0, logs.length - 100);
            }
            
            localStorage.setItem('app_logs', JSON.stringify(logs));
        } catch (error) {
            console.error('Error guardando log:', error);
        }
    }

    // Obtener logs guardados
    static getLogs() {
        try {
            return JSON.parse(localStorage.getItem('app_logs') || '[]');
        } catch (error) {
            return [];
        }
    }

    // Limpiar logs
    static clearLogs() {
        localStorage.removeItem('app_logs');
    }
}

// Clase para manejo de alertas y notificaciones
class AlertManager {
    constructor(containerId = 'alerts') {
        this.container = document.getElementById(containerId);
        this.alerts = new Map();
    }

    show(message, type = 'info', duration = 5000, id = null) {
        if (!this.container) return;

        const alertId = id || Utils.generateId();
        
        // Remover alerta existente con mismo ID
        if (this.alerts.has(alertId)) {
            this.remove(alertId);
        }

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        alertDiv.dataset.alertId = alertId;

        this.container.appendChild(alertDiv);
        this.alerts.set(alertId, alertDiv);

        // Auto-remover
        if (duration > 0) {
            setTimeout(() => this.remove(alertId), duration);
        }

        return alertId;
    }

    remove(alertId) {
        const alertDiv = this.alerts.get(alertId);
        if (alertDiv && alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
            this.alerts.delete(alertId);
        }
    }

    clear() {
        this.alerts.forEach((alertDiv) => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        });
        this.alerts.clear();
    }

    success(message, duration = 3000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 7000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 4000) {
        return this.show(message, 'info', duration);
    }
}

// Clase para manejo de localStorage mejorado
class Storage {
    static set(key, value, ttl = null) {
        try {
            const item = {
                value: value,
                timestamp: Date.now(),
                ttl: ttl
            };
            localStorage.setItem(key, JSON.stringify(item));
            return true;
        } catch (error) {
            Utils.log('error', 'Error guardando en localStorage', error);
            return false;
        }
    }

    static get(key) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;

            const parsed = JSON.parse(item);
            
            // Verificar TTL
            if (parsed.ttl && Date.now() > parsed.timestamp + parsed.ttl) {
                localStorage.removeItem(key);
                return null;
            }

            return parsed.value;
        } catch (error) {
            Utils.log('error', 'Error leyendo de localStorage', error);
            return null;
        }
    }

    static remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            Utils.log('error', 'Error removiendo de localStorage', error);
            return false;
        }
    }

    static clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            Utils.log('error', 'Error limpiando localStorage', error);
            return false;
        }
    }

    static getSize() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return total;
    }
}

// Exportar para uso global
window.Utils = Utils;
window.AlertManager = AlertManager;
window.Storage = Storage;