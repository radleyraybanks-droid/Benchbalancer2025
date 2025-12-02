// --- sw.js (Service Worker for Progressive Web App) ---

const CACHE_NAME = 'benchbalancer-v2.0.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles-modern.css',
    '/constants.js',
    '/dom-elements.js',
    '/game-state.js',
    '/utility-functions.js',
    '/variance-tracker.js',
    '/balance-display-component.js',
    '/lineup-generators.js',
    '/substitution-logic.js',
    '/ui-updates.js',
    '/modal-handlers.js',
    '/timer-and-gameplay.js',
    '/setup-and-reset.js',
    '/event-listeners.js',
    '/beep-warning.wav',
    '/startingwhistle.wav',
    '/song.mp3',
    '/icon-192.png',
    '/icon-512.png'
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.error('Cache installation failed:', err);
            })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                
                // Clone the request
                const fetchRequest = event.request.clone();
                
                return fetch(fetchRequest).then(response => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clone the response
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Background sync for saving game state
self.addEventListener('sync', event => {
    if (event.tag === 'sync-game-state') {
        event.waitUntil(syncGameState());
    }
});

async function syncGameState() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const gameState = await getStoredGameState();
        
        if (gameState) {
            // Save to server when online
            await fetch('/api/save-game-state', {
                method: 'POST',
                body: JSON.stringify(gameState),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
    } catch (error) {
        console.error('Sync failed:', error);
    }
}

async function getStoredGameState() {
    // Retrieve game state from IndexedDB
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('BenchBalancerDB', 1);
        
        request.onsuccess = event => {
            const db = event.target.result;
            const transaction = db.transaction(['gameState'], 'readonly');
            const store = transaction.objectStore('gameState');
            const getRequest = store.get('current');
            
            getRequest.onsuccess = () => {
                resolve(getRequest.result);
            };
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}
