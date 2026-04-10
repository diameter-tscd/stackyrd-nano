// Initialize Notyf Globally
window.notyf = new Notyf({
    duration: 2500,
    dismissible: false,
    position: { x: 'center', y: 'bottom' },
    ripple: false,
    types: [
        {
            type: 'success',
            background: '#16a34a',
            icon: {
                className: 'notyf__icon--success',
                tagName: 'i',
                color: 'white'
            }
        },
        {
            type: 'error',
            background: '#dc2626',
            duration: 5000
        },
        {
            type: 'info',
            background: '#3b82f6',
            icon: false
        }
    ]
});

// Lazy Loading System
window.lazyLoader = {
    // Track loaded resources
    loaded: new Set(),
    loading: new Set(),

    // Lazy load CodeMirror for specific tabs
    loadCodeMirrorForTab(tabId) {
        if (this.loaded.has(`codemirror-${tabId}`)) return Promise.resolve();

        return new Promise((resolve) => {
            // Check if CodeMirror is already loaded
            if (typeof CodeMirror !== 'undefined') {
                this.loaded.add(`codemirror-${tabId}`);
                resolve();
                return;
            }

            if (this.loading.has('codemirror')) {
                // Wait for existing load
                const checkLoaded = setInterval(() => {
                    if (typeof CodeMirror !== 'undefined') {
                        clearInterval(checkLoaded);
                        this.loaded.add(`codemirror-${tabId}`);
                        resolve();
                    }
                }, 100);
                return;
            }

            this.loading.add('codemirror');

            // Load CodeMirror CSS
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = '/assets/vendor/codemirror/codemirror.min.css';
            document.head.appendChild(cssLink);

            // Load CodeMirror JS
            const script = document.createElement('script');
            script.src = '/assets/vendor/codemirror/codemirror.min.js';
            script.onload = () => {
                this.loading.delete('codemirror');
                this.loaded.add(`codemirror-${tabId}`);
                resolve();
            };
            document.head.appendChild(script);
        });
    },

    // Lazy load tab-specific resources
    async loadTabResources(tabId) {
        switch (tabId) {
            case 'config':
            case 'banner':
            case 'postgres':
            case 'mongo':
                await this.loadCodeMirrorForTab(tabId);
                break;
            case 'system':
                await this.loadChartLibraries();
                break;
            case 'external':
                await this.loadExternalLibraries();
                break;
            // Add more cases for other tabs that need lazy loading
        }
    },

    // Lazy load chart libraries for system monitoring
    loadChartLibraries() {
        return new Promise((resolve) => {
            if (this.loaded.has('charts')) {
                resolve();
                return;
            }

            if (this.loading.has('charts')) {
                // Wait for existing load
                const checkLoaded = setInterval(() => {
                    if (this.loaded.has('charts')) {
                        clearInterval(checkLoaded);
                        resolve();
                    }
                }, 100);
                return;
            }

            this.loading.add('charts');
            // Charts are already inline SVG, so just mark as loaded
            this.loaded.add('charts');
            resolve();
        });
    },

    // Lazy load external service libraries
    loadExternalLibraries() {
        return new Promise((resolve) => {
            if (this.loaded.has('external')) {
                resolve();
                return;
            }

            if (this.loading.has('external')) {
                // Wait for existing load
                const checkLoaded = setInterval(() => {
                    if (this.loaded.has('external')) {
                        clearInterval(checkLoaded);
                        resolve();
                    }
                }, 100);
                return;
            }

            this.loading.add('external');
            // External services use basic fetch, no additional libraries needed
            this.loaded.add('external');
            resolve();
        });
    },

    // Lazy load images with progressive enhancement
    lazyLoadImage(imgElement) {
        if (!imgElement || imgElement.hasAttribute('data-loaded')) return;

        const src = imgElement.getAttribute('data-src');
        if (!src) return;

        // Create a small blurred placeholder
        const placeholder = document.createElement('div');
        placeholder.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
            border-radius: inherit;
        `;

        // Add loading animation CSS if not exists
        if (!document.getElementById('lazy-loading-styles')) {
            const style = document.createElement('style');
            style.id = 'lazy-loading-styles';
            style.textContent = `
                @keyframes loading {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                .lazy-loading {
                    position: relative;
                    overflow: hidden;
                }
                .lazy-loading img {
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                .lazy-loading img.loaded {
                    opacity: 1;
                }
            `;
            document.head.appendChild(style);
        }

        imgElement.parentNode.classList.add('lazy-loading');
        imgElement.parentNode.appendChild(placeholder);

        const img = new Image();
        img.onload = () => {
            placeholder.remove();
            imgElement.src = src;
            imgElement.classList.add('loaded');
            imgElement.setAttribute('data-loaded', 'true');
        };
        img.onerror = () => {
            placeholder.remove();
            imgElement.setAttribute('data-loaded', 'error');
        };
        img.src = src;
    },

    // Initialize Intersection Observer for general lazy loading
    initIntersectionObserver() {
        if (!('IntersectionObserver' in window)) return;

        const observerOptions = {
            root: null,
            rootMargin: '100px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;

                    // Handle lazy images
                    if (element.tagName === 'IMG' && element.hasAttribute('data-src')) {
                        this.lazyLoadImage(element);
                        observer.unobserve(element);
                    }

                    // Handle lazy background images
                    if (element.hasAttribute('data-bg')) {
                        element.style.backgroundImage = `url(${element.getAttribute('data-bg')})`;
                        element.removeAttribute('data-bg');
                        observer.unobserve(element);
                    }

                    // Handle lazy content loading
                    if (element.hasAttribute('data-lazy-content')) {
                        const contentType = element.getAttribute('data-lazy-content');
                        this.loadLazyContent(element, contentType);
                        observer.unobserve(element);
                    }
                }
            });
        }, observerOptions);

        // Observe lazy elements
        document.querySelectorAll('[data-src], [data-bg], [data-lazy-content]').forEach(el => {
            observer.observe(el);
        });

        return observer;
    },

    // Load lazy content based on type
    loadLazyContent(element, contentType) {
        switch (contentType) {
            case 'heavy-table':
                // Simulate loading heavy table data
                element.innerHTML = '<div class="animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div><div class="h-4 bg-gray-200 rounded w-1/2"></div></div>';
                setTimeout(() => {
                    element.innerHTML = '<div class="text-sm text-muted-foreground">Content loaded lazily</div>';
                }, 500);
                break;
            case 'chart':
                // Lazy load chart content
                element.innerHTML = '<div class="flex items-center justify-center h-32"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>';
                setTimeout(() => {
                    element.innerHTML = '<div class="text-sm text-muted-foreground">Chart loaded lazily</div>';
                }, 800);
                break;
        }
    }
};

// --- API Obfuscation Handler ---
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    try {
        const response = await originalFetch(...args);

        // Skip for streams (important!)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/event-stream')) {
            return response;
        }

        // Read text safely
        let bodyText = "";
        try {
            bodyText = await response.text();
        } catch (readErr) {
            return response;
        }

        if (!bodyText) {
            return new Response('', {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        }

        // Strategy 1: Try parsing as valid JSON directly.
        // If it works, it means it wasn't obfuscated (or obfuscation failed/disabled).
        try {
            JSON.parse(bodyText);
            // It is valid JSON. Return as is.
            return new Response(bodyText, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        } catch (e) {
            // Not valid JSON. Matches symptoms of Obfuscated (Base64 is not JSON-valid string usually).
        }

        // Strategy 2: Try decoding as Base64 JSON
        try {
            // Normalize Base64 (URL-safe, whitespace)
            let b64 = bodyText.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
            while (b64.length % 4) b64 += '=';

            // Decode
            // Use binary string conversion for UTF-8 safety
            const binaryStr = atob(b64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const decoded = new TextDecoder().decode(bytes);

            // Clean potential BOM
            const cleanDecoded = decoded.replace(/^\uFEFF/, '').trim();

            // Validate result is JSON
            JSON.parse(cleanDecoded);

            // Success! Return decoded.
            const newHeaders = new Headers(response.headers);
            newHeaders.delete('Content-Length');
            newHeaders.set('X-Obfuscated-Decoded', 'true'); // Debug flag

            return new Response(cleanDecoded, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });

        } catch (decodeErr) {
            // Not base64 json. 
        }

        // Fallback: Return original
        return new Response(bodyText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

    } catch (err) {
        throw err;
    }
};

function app() {


    return {
        activeTab: 'dashboard',
        sidebarOpen: false, // Mobile sidebar
        sidebarCollapsed: false, // Desktop sidebar (new)
        isDark: false, // synced in init

        menuCategories: [
            {
                name: 'General',
                items: [
                    { id: 'dashboard', label: 'Dashboard', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>' },
                    { id: 'endpoints', label: 'Endpoints', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>' }
                ]
            },
            {
                name: 'Infrastructure',
                items: [
                    { id: 'redis', label: 'Redis', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' },
                    { id: 'postgres', label: 'Postgres', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"></path><path d="M12 2v20"></path><path d="M20 20a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path><path d="M4 20a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path><path d="M20 4a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path><path d="M4 4a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path></svg>' },
                    { id: 'mongo', label: 'MongoDB', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.6 9.5C17.6 14.1944 13.8 18 9.1 18C4.4 18 0.6 14.1944 0.6 9.5C0.6 4.80558 4.4 1 9.1 1C13.8 1 17.6 4.80558 17.6 9.5Z"></path><path d="M12.1 9.5C12.1 11.9853 10 14 7.55 14C5.1 14 3 11.9853 3 9.5C3 7.01469 5.1 5 7.55 5C10 5 12.1 7.01469 12.1 9.5Z"></path><path d="M7.55 9.5V14"></path><path d="M7.55 5V9.5"></path><path d="M9.1 1V18"></path></svg>' },
                    { id: 'kafka', label: 'Kafka', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' },
                    { id: 'storage', label: 'Storage', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="21 12 21 12"></polyline><rect width="20" height="8" x="2" y="4" rx="2" ry="2"></rect><line x1="10" y1="8" x2="14" y2="8"></line></svg>' },
                    { id: 'system', label: 'System', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>' },
                    { id: 'external', label: 'External', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' }
                ]
            },
            {
                name: 'Periodic',
                items: [
                    { id: 'cron', label: 'Cron Jobs', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' }
                ]
            },
            {
                name: 'Other',
                items: [
                    { id: 'config', label: 'Config', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>' },
                    { id: 'banner', label: 'Banner', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>' },
                    { id: 'settings', label: 'User Settings', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' },
                    { id: 'maintenance', label: 'Maintenance', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>' }
                ]
            }
        ],

        // Flat tabs array for backward compatibility
        tabs: [
            { id: 'dashboard', label: 'Dashboard', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>' },
            { id: 'endpoints', label: 'Endpoints', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>' },
            { id: 'redis', label: 'Redis', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' },
            { id: 'postgres', label: 'Postgres', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"></path><path d="M12 2v20"></path><path d="M20 20a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path><path d="M4 20a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path><path d="M20 4a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path><path d="M4 4a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path></svg>' },
            { id: 'mongo', label: 'MongoDB', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.6 9.5C17.6 14.1944 13.8 18 9.1 18C4.4 18 0.6 14.1944 0.6 9.5C0.6 4.80558 4.4 1 9.1 1C13.8 1 17.6 4.80558 17.6 9.5Z"></path><path d="M12.1 9.5C12.1 11.9853 10 14 7.55 14C5.1 14 3 11.9853 3 9.5C3 7.01469 5.1 5 7.55 5C10 5 12.1 7.01469 12.1 9.5Z"></path><path d="M7.55 9.5V14"></path><path d="M7.55 5V9.5"></path><path d="M9.1 1V18"></path></svg>' },
            { id: 'kafka', label: 'Kafka', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' },
            { id: 'storage', label: 'Storage', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="21 12 21 12"></polyline><rect width="20" height="8" x="2" y="4" rx="2" ry="2"></rect><line x1="10" y1="8" x2="14" y2="8"></line></svg>' },
            { id: 'system', label: 'System', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>' },
            { id: 'external', label: 'External', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' },
            { id: 'cron', label: 'Cron Jobs', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' },
            { id: 'config', label: 'Config', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>' },
            { id: 'banner', label: 'Banner', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>' },
            { id: 'settings', label: 'User Settings', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' },
            { id: 'maintenance', label: 'Maintenance', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>' }
        ],

        // Dashboard Data
        serviceCount: 0,
        cpuUsage: 0,
        logs: [],
        cpuChart: null,
        endpoints: [],
        dummyLogActive: false,
        cronJobs: [],
        appConfig: {},
        configContent: '',
        bannerContent: '',
        monitoringConfig: { title: 'stackyrd-nano Admin', subtitle: 'Monitoring Dashboard' },

        // User Settings
        userSettings: { username: '', photoPath: '' },
        passwordForm: { current: '', new: '', confirm: '' },

        // System Data
        infraStats: { total: 0, active: 0, items: [] },
        infraStatus: {}, // New
        pgInfo: {},
        pgQueries: [],
        kafkaMsg: '',
        sysInfo: { hostname: '', ip: '', disk: {} },

        // Redis Data // New

        // Redis Data
        redisPattern: '*',
        redisKeys: [],
        redisModalOpen: false,
        selectedRedisKey: '',
        selectedRedisValue: '',

        // Infrastructure Data
        redis: {},
        postgres: {},
        postgresConnections: [], // New: List of all PostgreSQL connections
        selectedPostgresConnection: 'default', // New: Currently selected connection
        pgQueries: [],
        pgRefreshInterval: 5000, // Default 5s for running queries refresh
        pgRefreshActive: false,
        pgRefreshTimer: null,
        sqlQuery: "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';",
        queryResults: null,
        queryError: null,
        isQueryRunning: false,
        mongo: {},
        mongoConnections: [], // New: List of all MongoDB connections
        selectedMongoConnection: 'default', // New: Currently selected connection
        mongoInfo: {},
        mongoQuery: { collection: '', query: '{}' },
        mongoQueryResults: null,
        mongoQueryError: null,
        isMongoQueryRunning: false,
        kafka: {},
        cronJobs: [],

        // New Infrastructure
        storage: {},
        system: { cpu: {}, memory: {}, disk: {} },
        external: [],

        // System Graphs History
        sysHistory: {
            cpu: Array(20).fill(0),
            ram: Array(20).fill(0)
        },
        graphThrottle: 1000, // Default 1s
        lastGraphUpdate: 0,

        // Logs
        logThrottle: 1000,
        logInterval: null,

        // Notyf instance (Moved to window.notyf)



        // Correlation ID
        correlationId: '',

        getHeaders(contentType = 'application/json') {
            const headers = { 'Content-Type': contentType };
            if (this.correlationId) {
                headers['X-Correlation-ID'] = this.correlationId;
            }
            return headers;
        },

        async init() {
            // Load Correlation ID
            try { this.correlationId = localStorage.getItem('x_correlation_id') || ''; } catch (e) { console.warn("Storage blocked", e); }

            // Theme init
            try {
                this.isDark = localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
            } catch (e) { this.isDark = false; }

            if (this.isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }

            // Initialize lazy loading system
            if (window.lazyLoader) {
                window.lazyLoader.initIntersectionObserver();
            }

            // Initialize CodeMirror after Alpine mounts
            this.$nextTick(async () => {
                // All editors will be initialized when their tabs are opened (lazy loading)

                // Watchers to sync API data -> CodeMirror (Async Fetch)
                this.$watch('configContent', (val) => {
                    const el = document.getElementById('configEditor');
                    const cm = el ? el.cmInstance : null;
                    if (cm && cm.getValue() !== val) cm.setValue(val);
                });
                this.$watch('bannerContent', (val) => {
                    const el = document.getElementById('bannerEditor');
                    const cm = el ? el.cmInstance : null;
                    if (cm && cm.getValue() !== val) cm.setValue(val);
                });
                this.$watch('sqlQuery', (val) => {
                    const el = document.getElementById('sqlEditor');
                    const cm = el ? el.cmInstance : null;
                    if (cm && cm.getValue() !== val) cm.setValue(val);
                });

                // Watch for postgres reconnection
                this.$watch('infraStatus.postgres', (isConnected) => {
                    if (isConnected && this.activeTab === 'postgres') {
                        // Database reconnected while on postgres tab
                        // Wait for DOM to update, then re-init CodeMirror
                        this.$nextTick(() => {
                            setTimeout(() => {
                                const el = document.getElementById('sqlEditor');
                                if (el && !el.cmInstance) {
                                    this.initCodeMirror('sqlEditor', 'sql', 'sqlQuery');
                                }
                            }, 400);
                        });
                    }
                });

                // SSE
                this.connectLogs();

                // Periodic
                await this.fetchStatus();
                this.fetchDummyStatus();
                this.fetchMonitoringConfig();
                this.fetchUserSettings(); // Load user settings for header
                setInterval(() => this.fetchStatus(), 5000);

                // Load data for badges
                this.fetchEndpoints();
                this.fetchCronJobs();

                // Watch tab changes to load data & refresh CodeMirror
                this.$watch('activeTab', (val) => {
                    // CodeMirror Refresh
                    this.$nextTick(() => {
                        if (val === 'config') {
                            // Initialize Config editor if not already initialized
                            setTimeout(() => {
                                const el = document.getElementById('configEditor');
                                if (el && !el.cmInstance) {
                                    this.initCodeMirror('configEditor', 'yaml', 'configContent');
                                }
                                // Refresh if already exists
                                if (el && el.cmInstance) {
                                    el.cmInstance.refresh();
                                }
                            }, 400);
                        }
                        if (val === 'banner') {
                            // Initialize Banner editor if not already initialized
                            setTimeout(() => {
                                const el = document.getElementById('bannerEditor');
                                if (el && !el.cmInstance) {
                                    this.initCodeMirror('bannerEditor', 'shell', 'bannerContent');
                                }
                                // Refresh if already exists
                                if (el && el.cmInstance) {
                                    el.cmInstance.refresh();
                                }
                            }, 400);
                        }
                        if (val === 'postgres') {
                            // Initialize SQL editor if not already initialized
                            setTimeout(() => {
                                const el = document.getElementById('sqlEditor');
                                if (el && !el.cmInstance) {
                                    this.initCodeMirror('sqlEditor', 'sql', 'sqlQuery');
                                }
                                // Refresh if already exists
                                if (el && el.cmInstance) {
                                    el.cmInstance.refresh();
                                }
                            }, 400);
                        }
                    });

                    // Data Load
                    if (val === 'endpoints') this.fetchEndpoints();
                    if (val === 'redis') this.fetchRedisKeys();
                    if (val === 'postgres') {
                        this.fetchPostgresConnections();
                        this.fetchPgQueries();
                        this.fetchPgInfo();
                    } else {
                        // Stop auto-refresh when leaving postgres tab
                        if (this.pgRefreshActive) {
                            this.stopPgRefresh();
                            this.pgRefreshActive = false;
                        }
                    }
                    if (val === 'mongo') {
                        this.fetchMongoConnections();
                        this.fetchMongoInfo();
                    }
                    if (val === 'kafka') this.fetchKafka();
                    if (val === 'cron') this.fetchCronJobs();
                    if (val === 'config') this.fetchConfig();
                    if (val === 'banner') this.fetchBanner();
                    if (val === 'settings') this.fetchUserSettings();
                });
            });
        },


        get activeTabLabel() {
            const tab = this.tabs.find(t => t.id === this.activeTab);
            return tab ? tab.label : 'Dashboard';
        },

        get activeEndpointsCount() {
            return this.endpoints.filter(e => e.active).length;
        },

        get activeCronCount() {
            return this.cronJobs.length;
        },

        async logout() {
            try {
                // POST to logout endpoint to clear session
                await fetch('/logout', {
                    method: 'POST',
                    headers: this.getHeaders()
                });
            } catch (error) {
                // Silently handle logout error
            } finally {
                // Always redirect to login page (replace history to prevent back button)
                window.location.replace('/');
            }
        },

        async runQuery() {
            console.log('🔍 DEBUG: runQuery called');
            console.log('📝 Current sqlQuery value:', this.sqlQuery);
            console.log('📝 Current sqlQuery value:', this.sqlQuery);
            // console.log('📝 CodeMirror value:', cmInstances['sqlEditor']?.getValue());

            this.isQueryRunning = true;
            this.queryError = null;
            this.queryResults = null;

            try {
                const res = await fetch(`/api/postgres/query?connection=${encodeURIComponent(this.selectedPostgresConnection)}`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ query: this.sqlQuery })
                });

                const response = await res.json();
                const data = response.data; // Alias for cleaner access below if needed

                if (!res.ok) {
                    this.queryError = response.error?.message || response.message || 'Query failed';
                } else {
                    this.queryResults = data;
                    // Show toast for empty results
                    if (Array.isArray(data) && data.length === 0) {
                        this.showToast('Query executed successfully, but returned no rows.', 'info');
                    }
                }
            } catch (err) {
                this.queryError = "Network error: " + err.message;
            } finally {
                this.isQueryRunning = false;
            }
        },

        async restartService() {
            if (!confirm('Are you sure you want to restart the service? This will briefly interrupt availability.')) return;

            try {
                const res = await fetch('/api/restart', {
                    method: 'POST',
                    headers: this.getHeaders()
                });
                if (res.ok) {
                    this.showToast('Service is restarting...', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                } else {
                    this.showToast('Failed to restart service', 'error');
                }
            } catch (err) {
                console.error("Restart error:", err);
                this.showToast('Failed to connect to server', 'error');
            }
        },

        toggleTheme() {
            this.isDark = !this.isDark;
            if (this.isDark) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
        },

        // Toast Methods (Wrapper for Notyf)
        showToast(message, type = 'info', title = '') {
            // Title is ignored in standard Notyf simple calls, appending if present
            const msg = title ? `<b>${title}</b><br>${message}` : message;

            if (!window.notyf) return; // Safety check

            if (type === 'success') {
                window.notyf.success(msg);
            } else if (type === 'error') {
                window.notyf.error(msg);
            } else {
                window.notyf.open({
                    type: 'info',
                    message: msg
                });
            }
        },

        // Logs
        updateThrottle() {
            if (this.logInterval) clearInterval(this.logInterval);
            this.setupLogFlush();
        },

        setupLogFlush() {
            const MAX_LOGS = 100;
            this.logInterval = setInterval(() => {
                if (this.logBuffer && this.logBuffer.length > 0) {
                    this.logs.push(...this.logBuffer);
                    this.logBuffer = [];

                    if (this.logs.length > MAX_LOGS) {
                        this.logs = this.logs.slice(-MAX_LOGS);
                    }

                    this.$nextTick(() => {
                        const box = document.getElementById('logs-box');
                        if (box) box.scrollTop = box.scrollHeight;
                    });
                }
            }, parseInt(this.logThrottle));
        },

        connectLogs() {
            const es = new EventSource('/api/logs');
            this.logBuffer = [];

            es.onmessage = (e) => {
                const msg = e.data.replace(/\u001b\[\d+m/g, "");
                this.logBuffer.push(msg);
            };

            this.setupLogFlush();
        },

        formatLog(logLine) {
            try {
                // Try parsing JSON first (Zerolog format)
                const data = JSON.parse(logLine);
                const time = data.time ? new Date(data.time).toLocaleTimeString() : '';
                const level = (data.level || 'UNKNOWN').toUpperCase();
                const msg = data.message || JSON.stringify(data);

                let badgeClass = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
                if (level === 'INFO' || level === 'INF') badgeClass = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
                if (level === 'WARN' || level === 'WARNING') badgeClass = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
                if (level === 'ERROR' || level === 'FATAL') badgeClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
                if (level === 'DEBUG') badgeClass = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';

                return `<div class="flex items-start gap-4 text-xs font-mono leading-relaxed">
                            <span class="text-muted-foreground w-[85px] shrink-0 pt-0.5">${time}</span>
                            <span class="px-1.5 py-0.5 rounded-[4px] font-semibold text-[10px] shrink-0 w-[50px] text-center ${badgeClass}">${level}</span>
                            <span class="text-foreground break-all pt-0.5">${msg}</span>
                        </div>`;
            } catch (e) {
                // Fallback for raw text - Try to extract level
                let badgeClass = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
                let level = 'RAW';
                let displayMsg = logLine;
                let timestamp = new Date().toLocaleTimeString();

                // Improved regex to handle optional ANSI codes and brackets
                // Matches optional ANSI -> Timestamp -> optional ANSI -> optional Bracket -> Level -> optional Bracket -> optional ANSI -> Message
                const parts = logLine.match(/^\s*(?:[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])?(\d{2}:\d{2}:\d{2})\s+(?:[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])?(?:\[\s*)?(\w+)(?:\s*\])?(?:[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])?\s+(.*)$/);

                if (parts) {
                    timestamp = parts[1];
                    let rawLevel = parts[2].toUpperCase();

                    // Map short levels to full names
                    if (rawLevel === 'INF') level = 'INFO';
                    else if (rawLevel === 'WRN' || rawLevel === 'WARNING') level = 'WARN';
                    else if (rawLevel === 'ERR') level = 'ERROR';
                    else if (rawLevel === 'DBG') level = 'DEBUG';
                    else if (rawLevel === 'FTL') level = 'FATAL';
                    else level = rawLevel;

                    displayMsg = parts[3];
                } else if (logLine.includes('INFO')) level = 'INFO';
                else if (logLine.includes('WARN')) level = 'WARN';
                else if (logLine.includes('ERROR') || logLine.includes('FAIL')) level = 'ERROR';
                else if (logLine.includes('DEBUG') || logLine.includes('DBG')) level = 'DEBUG';

                // Clean up any remaining ANSI codes from display message
                displayMsg = displayMsg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

                // Truncate level to 5 chars max for badge
                if (level.length > 5) level = level.substring(0, 5);

                if (level.includes('INFO')) badgeClass = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
                if (level.includes('WARN')) badgeClass = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
                if (level.includes('ERR') || level.includes('FAIL') || level === 'FATAL') badgeClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
                if (level.includes('DEBUG')) badgeClass = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';

                return `<div class="flex items-start gap-4 text-xs font-mono leading-relaxed">
                            <span class="text-muted-foreground w-[85px] shrink-0 pt-0.5">${timestamp}</span>
                             <span class="px-1.5 py-0.5 rounded-[4px] font-semibold text-[10px] shrink-0 w-[50px] text-center ${badgeClass}">${level}</span>
                            <span class="text-foreground break-all pt-0.5">${displayMsg}</span>
                        </div>`;
            }
        },

        async fetchStatus() {
            try {
                const res = await fetch('/api/status', { headers: this.getHeaders() });
                const response = await res.json();
                const data = response.data || {};

                // Services
                const servicesData = data.services;
                this.services = Array.isArray(servicesData) ? servicesData : [];
                this.serviceCount = this.services.filter(s => s.active).length;

                // Infrastructure
                // Backend returns keys: redis, postgres, kafka, minio(storage), mongo, external
                // We map them to infraStatus for simple TRUE/FALSE checks or specific logic
                const hasConfiguredPostgres = data.postgres && data.postgres.connections && Object.keys(data.postgres.connections).length > 0;
                const hasConfiguredMongo = data.mongo && data.mongo.connections && Object.keys(data.mongo.connections).length > 0;
                const infra = {
                    redis: data.redis && data.redis.connected,
                    postgres: hasConfiguredPostgres,
                    mongo: hasConfiguredMongo || (data.mongo && data.mongo.connections), // Show MongoDB tab if configured, even if not connected
                    kafka: data.kafka && data.kafka.connected,
                    minio: data.storage && data.storage.connected,
                    external: data.external && data.external.length > 0
                };

                // data.external is likely a map or list? 
                // HttpManager.GetStatus() returns map[string]interface{ "services": []... }?
                // No, HttpManager GetStatus returns map with "services" list.
                // Let's assume connected if at least one check ran? 
                // Actually External tab shows individual status.

                this.infraStatus = infra;

                // Count active infrastructure
                // defined as connected=true
                const infraKeys = Object.keys(infra);
                const activeInfra = Object.values(infra).filter(Boolean).length;
                this.infraStats = {
                    total: infraKeys.length,
                    active: activeInfra,
                    items: infraKeys.map(k => ({ name: k, active: infra[k] }))
                };

                // Update specific data sections
                this.redis = data.redis || {};
                this.postgres = data.postgres || {};
                this.kafka = data.kafka || {};
                this.storage = data.storage || {};
                this.external = data.external || [];

                // System Graphs Data
                if (data.system) {
                    this.system = data.system; // Fix: Assign entire system object for graphs

                    // Update History for Graphs
                    const now = Date.now();
                    if (now - this.lastGraphUpdate > (this.graphThrottle || 1000)) {
                        this.sysHistory.cpu.push(data.system.cpu?.usage_percent || 0);
                        this.sysHistory.cpu.shift();

                        this.sysHistory.ram.push(data.system.memory?.used_percent || 0);
                        this.sysHistory.ram.shift();

                        this.lastGraphUpdate = now;
                    }
                }

                // System Info (Host/IP) - Mapped from system_info (added in backend)
                if (data.system_info) {
                    this.sysInfo = {
                        hostname: data.system_info.hostname || 'Unknown',
                        ip: data.system_info.ip || 'Unknown',
                        disk: data.system?.disk || {}
                    };
                }

            } catch (e) { console.error("Fetch status error", e); }
        },

        async fetchDummyStatus() {
            try {
                const res = await fetch('/api/logs/dummy/status', { headers: this.getHeaders() });
                const response = await res.json();
                this.dummyLogActive = response.data?.active;
            } catch (e) { }
        },

        async fetchMonitoringConfig() {
            try {
                const res = await fetch('/api/monitoring/config', { headers: this.getHeaders() });
                const response = await res.json();
                const data = response.data || {};
                if (data.title) this.monitoringConfig.title = data.title;
                if (data.subtitle) this.monitoringConfig.subtitle = data.subtitle;
            } catch (e) { }
        },


        async toggleDummyLog() {
            try {
                const res = await fetch('/api/logs/dummy', {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ enable: !this.dummyLogActive })
                });
                const data = await res.json();
                this.dummyLogActive = !this.dummyLogActive;
                // Force sync
                this.fetchDummyStatus();
            } catch (e) { }
        },

        async fetchEndpoints() {
            try {
                const res = await fetch('/api/endpoints', { headers: this.getHeaders() });
                const response = await res.json();
                if (Array.isArray(response.data)) {
                    this.endpoints = response.data;
                } else {
                    console.error("fetchEndpoints: Expected array but got", response.data);
                    this.endpoints = [];
                }
            } catch (e) {
                console.error("fetchEndpoints error", e);
                this.endpoints = [];
            }
        },

        async fetchCronJobs() {
            try {
                const res = await fetch('/api/cron', { headers: this.getHeaders() });
                const response = await res.json();
                this.cronJobs = response.data || [];
            } catch (e) { this.cronJobs = []; }
        },

        async fetchConfig() {
            try {
                // Fetch raw for editor
                const res = await fetch('/api/config/raw', { headers: this.getHeaders() });
                const response = await res.json();
                this.configContent = response.data?.content || '';

                // Keep appConfig for viewing if needed, but we focus on editor now
                // this.appConfig = ...
            } catch (e) { this.configContent = '# Error loading config.yaml'; }
        },

        async saveConfigText() {
            try {
                const res = await fetch('/api/config', {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ content: this.configContent })
                });
                const data = await res.json();
                if (res.ok) {
                    this.showToast(data.message, 'success', 'Saved');
                } else {
                    this.showToast(data.error?.message || data.message || 'Failed to save', 'error', 'Error');
                }
            } catch (e) { this.showToast('Failed to save config', 'error', 'Error'); }
        },

        async backupConfig() {
            try {
                const res = await fetch('/api/config/backup', {
                    method: 'POST',
                    headers: this.getHeaders()
                });
                const data = await res.json();
                if (res.ok) {
                    this.showToast(data.message, 'success', 'Backup Created');
                } else {
                    this.showToast(data.error?.message || data.message || 'Backup failed', 'error', 'Error');
                }
            } catch (e) { this.showToast('Failed to backup config', 'error', 'Error'); }
        },

        async fetchBanner() {
            try {
                const res = await fetch('/api/banner', { headers: this.getHeaders() });
                const response = await res.json();
                this.bannerContent = response.data?.content || '';
            } catch (e) { this.bannerContent = 'Error loading banner'; }
        },

        async saveBanner() {
            try {
                const res = await fetch('/api/banner', {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ content: this.bannerContent })
                });
                if (res.ok) {
                    this.showToast('Banner saved successfully!', 'success', 'Saved');
                } else {
                    this.showToast('Failed to save banner.', 'error', 'Error');
                }
            } catch (e) { this.showToast('Error saving banner', 'error', 'Error'); }
        },

        async fetchRedisKeys() {
            try {
                const res = await fetch(`/api/redis/keys?pattern=${encodeURIComponent(this.redisPattern)}`, { headers: this.getHeaders() });
                const response = await res.json();
                this.redisKeys = Array.isArray(response.data) ? response.data : [];
            } catch (e) { this.redisKeys = []; }
        },

        async viewRedisValue(key) {
            this.selectedRedisKey = key;
            this.selectedRedisValue = 'Loading...';
            this.redisModalOpen = true;
            try {
                const res = await fetch(`/api/redis/key/${encodeURIComponent(key)}`, { headers: this.getHeaders() });
                const response = await res.json();
                this.selectedRedisValue = response.data?.value;
            } catch (e) { this.selectedRedisValue = 'Error fetching value'; }
        },

        async fetchPgQueries() {
            try {
                const res = await fetch(`/api/postgres/queries?connection=${encodeURIComponent(this.selectedPostgresConnection)}`, { headers: this.getHeaders() });
                const response = await res.json();
                this.pgQueries = response.data || [];
            } catch (e) { this.pgQueries = []; }
        },

        togglePgRefresh() {
            this.pgRefreshActive = !this.pgRefreshActive;
            if (this.pgRefreshActive) {
                this.startPgRefresh();
            } else {
                this.stopPgRefresh();
            }
        },

        startPgRefresh() {
            this.stopPgRefresh(); // Clear any existing timer
            this.pgRefreshTimer = setInterval(() => {
                if (this.activeTab === 'postgres') {
                    this.fetchPgQueries();
                }
            }, this.pgRefreshInterval);
        },

        stopPgRefresh() {
            if (this.pgRefreshTimer) {
                clearInterval(this.pgRefreshTimer);
                this.pgRefreshTimer = null;
            }
        },

        updatePgRefreshInterval() {
            if (this.pgRefreshActive) {
                this.startPgRefresh(); // Restart with new interval
            }
        },

        async fetchPgInfo() {
            try {
                const res = await fetch(`/api/postgres/info?connection=${encodeURIComponent(this.selectedPostgresConnection)}`, { headers: this.getHeaders() });
                const response = await res.json();
                this.pgInfo = response.data || {};
            } catch (e) { }
        },

        async fetchPostgresConnections() {
            try {
                const res = await fetch('/api/status', { headers: this.getHeaders() });
                const response = await res.json();
                const data = response.data || {};

                // Check if postgres data contains connections object
                if (data.postgres && data.postgres.connections && typeof data.postgres.connections === 'object') {
                    // Extract connections from the connections object
                    const connections = Object.keys(data.postgres.connections).map(connName => ({
                        name: connName,
                        status: data.postgres.connections[connName]
                    }));

                    if (connections.length > 0) {
                        this.postgresConnections = connections;
                        // Keep current selection if it's still valid, otherwise set to first connection
                        const currentValid = connections.some(conn => conn.name === this.selectedPostgresConnection);
                        if (!currentValid) {
                            this.selectedPostgresConnection = connections[0].name || 'default';
                        }
                    } else {
                        this.postgresConnections = [];
                        this.selectedPostgresConnection = 'default';
                    }
                } else {
                    this.postgresConnections = [];
                }
            } catch (e) {
                console.error("Failed to fetch PostgreSQL connections", e);
                this.postgresConnections = [];
            }
        },

        async changePostgresConnection(connectionName) {
            this.selectedPostgresConnection = connectionName;
            // Refresh PostgreSQL data for the selected connection
            await this.fetchPgInfo();
            await this.fetchPgQueries();
            this.showToast(`Switched to PostgreSQL connection: ${connectionName}`, 'info');
        },

        async fetchMongoConnections() {
            try {
                const res = await fetch('/api/status', { headers: this.getHeaders() });
                const response = await res.json();
                const data = response.data || {};

                // Check if mongo data contains connections object
                if (data.mongo && data.mongo.connections && typeof data.mongo.connections === 'object') {
                    // Extract connections from the connections object
                    const connections = Object.keys(data.mongo.connections).map(connName => ({
                        name: connName,
                        status: data.mongo.connections[connName]
                    }));

                    if (connections.length > 0) {
                        this.mongoConnections = connections;
                        // Keep current selection if it's still valid, otherwise set to first connection
                        const currentValid = connections.some(conn => conn.name === this.selectedMongoConnection);
                        if (!currentValid) {
                            this.selectedMongoConnection = connections[0].name || 'default';
                        }
                    } else {
                        this.mongoConnections = [];
                        this.selectedMongoConnection = 'default';
                    }
                } else {
                    this.mongoConnections = [];
                }
            } catch (e) {
                console.error("Failed to fetch MongoDB connections", e);
                this.mongoConnections = [];
            }
        },

        async changeMongoConnection(connectionName) {
            this.selectedMongoConnection = connectionName;
            // Refresh MongoDB data for the selected connection
            await this.fetchMongoInfo();
            this.showToast(`Switched to MongoDB connection: ${connectionName}`, 'info');
        },

        async fetchMongoInfo() {
            try {
                const res = await fetch(`/api/mongo/info?connection=${encodeURIComponent(this.selectedMongoConnection)}`, { headers: this.getHeaders() });
                const response = await res.json();
                this.mongoInfo = response.data || {};
            } catch (e) {
                this.mongoInfo = {};
            }
        },

        async runMongoQuery() {
            console.log('🔍 DEBUG: runMongoQuery called');
            console.log('📝 Current mongoQuery:', this.mongoQuery);

            this.isMongoQueryRunning = true;
            this.mongoQueryError = null;
            this.mongoQueryResults = null;

            try {
                // Parse the query string to JSON
                let queryObj;
                try {
                    queryObj = JSON.parse(this.mongoQuery.query);
                } catch (parseErr) {
                    throw new Error('Invalid JSON query: ' + parseErr.message);
                }

                const res = await fetch(`/api/mongo/query?connection=${encodeURIComponent(this.selectedMongoConnection)}`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        collection: this.mongoQuery.collection,
                        query: queryObj
                    })
                });

                const response = await res.json();
                const data = response.data;

                if (!res.ok) {
                    this.mongoQueryError = response.error?.message || response.message || 'Query failed';
                } else {
                    this.mongoQueryResults = data;
                    // Show toast for empty results
                    if (Array.isArray(data) && data.length === 0) {
                        this.showToast('Query executed successfully, but returned no documents.', 'info');
                    }
                }
            } catch (err) {
                this.mongoQueryError = "Network error: " + err.message;
            } finally {
                this.isMongoQueryRunning = false;
            }
        },

        async fetchKafka() {
            try {
                const res = await fetch('/api/kafka/topics', { headers: this.getHeaders() });
                const response = await res.json();
                this.kafkaMsg = response.message || JSON.stringify(response.data, null, 2);
            } catch (e) { }
        },

        // User Settings Methods
        async fetchUserSettings() {
            try {
                const res = await fetch('/api/user/settings', { headers: this.getHeaders() });
                const response = await res.json();
                const data = response.data || {};
                this.userSettings.username = data.username || 'Admin';
                this.userSettings.photoPath = data.photo_path || '';
            } catch (e) { }
        },

        async updateUsername() {
            try {
                const res = await fetch('/api/user/settings', {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ username: this.userSettings.username })
                });
                const data = await res.json();
                if (res.ok) {
                    this.showToast(data.message || 'Username updated', 'success', 'Updated');
                } else {
                    this.showToast(data.error?.message || data.message || 'Update failed', 'error', 'Error');
                }
            } catch (e) {
                this.showToast('Failed to update username', 'error', 'Error');
            }
        },

        async changePassword() {
            if (this.passwordForm.new !== this.passwordForm.confirm) {
                this.showToast('New passwords do not match', 'error', 'Validation');
                return;
            }
            try {
                const res = await fetch('/api/user/password', {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        current_password: this.passwordForm.current,
                        new_password: this.passwordForm.new
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    this.showToast(data.message || 'Password changed', 'success', 'Success');
                    this.passwordForm = { current: '', new: '', confirm: '' };
                } else {
                    this.showToast(data.error?.message || data.message || 'Failed to change password', 'error', 'Error');
                }
            } catch (e) {
                this.showToast('Failed to change password', 'error', 'Error');
            }
        },

        async uploadPhoto(event) {
            const file = event.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('photo', file);

            try {
                // Determine headers but REMOVE Content-Type so browser sets boundary for multipart
                const headers = this.getHeaders();
                delete headers['Content-Type'];

                const res = await fetch('/api/user/photo', {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });
                const response = await res.json();
                if (res.ok) {
                    this.userSettings.photoPath = response.data?.photo_path;
                    this.showToast(response.message || 'Photo uploaded', 'success', 'Success');
                } else {
                    this.showToast(response.error?.message || response.message || 'Upload failed', 'error', 'Error');
                }
            } catch (e) {
                this.showToast('Upload failed', 'error', 'Error');
            }
        },

        async deletePhoto() {
            if (!confirm('Delete profile photo?')) return;
            try {
                const res = await fetch('/api/user/photo', {
                    method: 'DELETE',
                    headers: this.getHeaders()
                });
                const response = await res.json();
                if (res.ok) {
                    this.userSettings.photoPath = '';
                    this.showToast(response.message || 'Photo deleted', 'success', 'Deleted');
                } else {
                    this.showToast(response.error?.message || response.message || 'Delete failed', 'error', 'Error');
                }
            } catch (e) {
                this.showToast('Delete failed', 'error', 'Error');
            }
        },

        initCodeMirror(id, mode, model) {
            const el = document.getElementById(id);
            if (!el) return;

            // Check if this textarea has already been converted to CodeMirror
            // We check the DOM property 'cmInstance' which is safe from Alpine Proxies
            if (el.cmInstance) {
                el.cmInstance.refresh();
                return;
            }

            // Double check for next sibling class just in case manual init happened elsewhere
            if (el.nextElementSibling && el.nextElementSibling.classList && el.nextElementSibling.classList.contains('CodeMirror')) {
                if (el.nextElementSibling.CodeMirror) {
                    el.cmInstance = el.nextElementSibling.CodeMirror;
                    el.cmInstance.refresh();
                    return;
                }
            }

            try {
                // Postgres specific mode if requested
                const actualMode = (mode === 'sql') ? 'text/x-pgsql' : mode;

                const cm = CodeMirror.fromTextArea(el, {
                    mode: actualMode,
                    theme: 'dracula',
                    lineNumbers: true,
                    lineWrapping: true,
                    // Pass explicit keymap to avoid 'map' errors if default is missing
                    extraKeys: { "Ctrl-Space": "autocomplete" }
                });

                // Two-way binding: Update Alpine data on change
                cm.on('change', () => {
                    this[model] = cm.getValue();
                });

                // Set initial value from Alpine data
                if (this[model]) {
                    cm.setValue(this[model]);
                }

                // Store instance on the DOM element itself
                // This ensures it survives re-renders if the element persists, 
                // and avoids Alpine Proxy wrapping the instance.
                el.cmInstance = cm;

                // Also store reference on the wrapper for redundancy
                cm.getWrapperElement().CodeMirror = cm;

            } catch (error) {
                console.error("CodeMirror initialization error for " + id, error);
            }
        }
    }
}
