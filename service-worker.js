// Service Worker - Monitor de Conducción ITSON
// Maneja cache offline y operaciones en segundo plano

const CACHE_NAME = 'driving-monitor-v1.0.0';
const STATIC_CACHE_URLS = [
    './',
    './index.html',
    './app.js',
    './manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Archivos en cache');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                // Forzar activación inmediata
                return self.skipWaiting();
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activando...');
    
    event.waitUntil(
        // Limpiar caches viejos
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Limpiando cache viejo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Tomar control de todas las páginas inmediatamente
            return self.clients.claim();
        })
    );
});

// Interceptar peticiones de red
self.addEventListener('fetch', (event) => {
    // Solo cachear peticiones GET
    if (event.request.method !== 'GET') {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Si está en cache, devolver desde cache
                if (response) {
                    return response;
                }
                
                // Si no está en cache, intentar de la red
                return fetch(event.request).then(response => {
                    // Si la respuesta no es válida, no cachear
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clonar respuesta para cache
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                }).catch(() => {
                    // Si no hay red, mostrar página offline básica
                    if (event.request.destination === 'document') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});

// Manejar mensajes desde la aplicación principal
self.addEventListener('message', (event) => {
    console.log('Service Worker: Mensaje recibido:', event.data);
    
    if (event.data && event.data.type) {
        switch (event.data.type) {
            case 'SKIP_WAITING':
                self.skipWaiting();
                break;
                
            case 'SAVE_DATA':
                // Guardar datos importantes en IndexedDB para persistencia
                saveDataToIndexedDB(event.data.payload);
                break;
                
            case 'GET_DATA':
                // Recuperar datos desde IndexedDB
                getDataFromIndexedDB().then(data => {
                    event.ports[0].postMessage(data);
                });
                break;
                
            case 'KEEP_ALIVE':
                // Mantener el service worker activo
                console.log('Service Worker: Manteniéndose activo para grabación');
                break;
        }
    }
});

// Funciones para IndexedDB (persistencia de datos)
function saveDataToIndexedDB(data) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('DrivingMonitorDB', 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['driving_data'], 'readwrite');
            const store = transaction.objectStore('driving_data');
            
            const putRequest = store.put(data);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
        
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('driving_data')) {
                const store = db.createObjectStore('driving_data', { keyPath: 'id' });
                store.createIndex('participante', 'participante', { unique: false });
                store.createIndex('fecha', 'fecha', { unique: false });
            }
        };
    });
}

function getDataFromIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('DrivingMonitorDB', 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['driving_data'], 'readonly');
            const store = transaction.objectStore('driving_data');
            
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
        };
    });
}

// Mantener Service Worker activo durante grabación
let keepAliveInterval;

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'START_RECORDING') {
        console.log('Service Worker: Iniciando modo grabación');
        
        // Mantener SW activo cada 25 segundos
        keepAliveInterval = setInterval(() => {
            console.log('Service Worker: Manteniéndose activo...');
            
            // Enviar mensaje de vuelta para confirmar que está activo
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_ALIVE',
                        timestamp: new Date().toISOString()
                    });
                });
            });
        }, 25000);
    }
    
    if (event.data && event.data.type === 'STOP_RECORDING') {
        console.log('Service Worker: Deteniendo modo grabación');
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
    }
});

// Manejar cuando la aplicación se cierra
self.addEventListener('beforeunload', () => {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
});

// Notificaciones push (para futuras funcionalidades)
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push recibido');
    
    const options = {
        body: 'Monitor de Conducción está funcionando en segundo plano',
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        },
        actions: [
            {
                action: 'open',
                title: 'Abrir aplicación',
                icon: './icon-192.png'
            },
            {
                action: 'close',
                title: 'Cerrar',
                icon: './icon-192.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Monitor de Conducción', options)
    );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Click en notificación');
    
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('./')
        );
    }
});

// Sync en segundo plano (para subir datos cuando haya conexión)
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync:', event.tag);
    
    if (event.tag === 'background-sync-data') {
        event.waitUntil(syncDataWhenOnline());
    }
});

async function syncDataWhenOnline() {
    try {
        // Verificar si hay conexión
        if (!navigator.onLine) {
            console.log('Service Worker: Sin conexión, sync pospuesto');
            return;
        }
        
        // Obtener datos pendientes de sincronizar
        const pendingData = await getDataFromIndexedDB();
        
        if (pendingData.length > 0) {
            console.log(`Service Worker: Sincronizando ${pendingData.length} registros`);
            
            // Aquí podrías agregar lógica para subir a GitHub API
            // Por ahora solo registramos que está listo para sync
            
            // Notificar a la aplicación principal
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'SYNC_COMPLETE',
                    count: pendingData.length
                });
            });
        }
        
    } catch (error) {
        console.error('Service Worker: Error en sync:', error);
    }
}

console.log('Service Worker: Cargado y listo');