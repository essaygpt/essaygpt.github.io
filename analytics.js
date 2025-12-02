// ============================================
// ESSAYGPT ANALYTICS SYSTEM
// Hidden admin dashboard - Type "essaystats" to open
// ============================================

const Analytics = {
    // Storage keys
    STORAGE_KEY: 'essaygpt_analytics',
    VISITOR_ID_KEY: 'essaygpt_visitor_id',
    SESSION_ID_KEY: 'essaygpt_session_id',
    
    // Current session data
    currentSession: null,
    visitorId: null,
    sessionId: null,
    sessionStart: null,
    ipData: null,
    
    // Secret code to open analytics
    secretCode: 'essaystats',
    typedKeys: '',
    
    // Initialize analytics
    init() {
        this.visitorId = this.getOrCreateVisitorId();
        this.sessionId = this.createSessionId();
        this.sessionStart = Date.now();
        
        // Fetch IP and location data
        this.fetchIPData();
        
        // Track page view
        this.trackEvent('page_view', { page: window.location.pathname });
        
        // Set up event listeners
        this.setupEventListeners();
        this.setupSecretCodeListener();
        
        // Track session duration on unload
        window.addEventListener('beforeunload', () => this.endSession());
        
        // Update session every minute
        setInterval(() => this.updateSessionDuration(), 60000);
        
        console.log('📊 Analytics initialized (Type "essaystats" to view dashboard)');
    },
    
    // Generate unique visitor ID
    getOrCreateVisitorId() {
        let id = localStorage.getItem(this.VISITOR_ID_KEY);
        if (!id) {
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(this.VISITOR_ID_KEY, id);
            this.trackNewVisitor();
        }
        return id;
    },
    
    // Create session ID
    createSessionId() {
        const id = 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem(this.SESSION_ID_KEY, id);
        return id;
    },
    
    // Fetch IP and geolocation data
    async fetchIPData() {
        try {
            // Try multiple IP services for reliability
            const services = [
                'https://ipapi.co/json/',
                'https://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,query',
                'https://ipwho.is/'
            ];
            
            for (const url of services) {
                try {
                    const response = await fetch(url, { timeout: 5000 });
                    if (response.ok) {
                        const data = await response.json();
                        this.ipData = this.normalizeIPData(data, url);
                        this.updateVisitorWithIP();
                        return;
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (error) {
            console.log('Could not fetch IP data:', error);
            this.ipData = { ip: 'Unknown', country: 'Unknown', city: 'Unknown' };
        }
    },
    
    // Normalize IP data from different providers
    normalizeIPData(data, source) {
        if (source.includes('ipapi.co')) {
            return {
                ip: data.ip,
                country: data.country_name || data.country,
                countryCode: data.country_code,
                city: data.city,
                region: data.region,
                timezone: data.timezone,
                isp: data.org
            };
        } else if (source.includes('ip-api.com')) {
            return {
                ip: data.query,
                country: data.country,
                countryCode: data.countryCode,
                city: data.city,
                region: data.regionName,
                timezone: data.timezone,
                isp: data.isp
            };
        } else if (source.includes('ipwho.is')) {
            return {
                ip: data.ip,
                country: data.country,
                countryCode: data.country_code,
                city: data.city,
                region: data.region,
                timezone: data.timezone?.id,
                isp: data.connection?.isp
            };
        }
        return data;
    },
    
    // Get browser info
    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let version = '';
        
        if (ua.includes('Firefox/')) {
            browser = 'Firefox';
            version = ua.match(/Firefox\/(\d+)/)?.[1] || '';
        } else if (ua.includes('Edg/')) {
            browser = 'Edge';
            version = ua.match(/Edg\/(\d+)/)?.[1] || '';
        } else if (ua.includes('Chrome/')) {
            browser = 'Chrome';
            version = ua.match(/Chrome\/(\d+)/)?.[1] || '';
        } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
            browser = 'Safari';
            version = ua.match(/Version\/(\d+)/)?.[1] || '';
        } else if (ua.includes('Opera') || ua.includes('OPR/')) {
            browser = 'Opera';
            version = ua.match(/(?:Opera|OPR)\/(\d+)/)?.[1] || '';
        }
        
        return { browser, version, fullUA: ua };
    },
    
    // Get device info
    getDeviceInfo() {
        const ua = navigator.userAgent;
        let device = 'Desktop';
        let os = 'Unknown';
        
        if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) {
            device = /iPad/i.test(ua) ? 'Tablet' : 'Mobile';
        }
        
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac OS')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
        
        return { device, os, screenWidth: window.screen.width, screenHeight: window.screen.height };
    },
    
    // Track new visitor
    trackNewVisitor() {
        const data = this.getAnalyticsData();
        data.stats.totalVisitors++;
        this.saveAnalyticsData(data);
    },
    
    // Update visitor with IP data
    updateVisitorWithIP() {
        if (!this.ipData) return;
        
        const data = this.getAnalyticsData();
        const browserInfo = this.getBrowserInfo();
        const deviceInfo = this.getDeviceInfo();
        
        const visitor = {
            visitorId: this.visitorId,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            ip: this.ipData.ip,
            country: this.ipData.country,
            countryCode: this.ipData.countryCode,
            city: this.ipData.city,
            region: this.ipData.region,
            timezone: this.ipData.timezone,
            isp: this.ipData.isp,
            browser: browserInfo.browser,
            browserVersion: browserInfo.version,
            device: deviceInfo.device,
            os: deviceInfo.os,
            screenSize: `${deviceInfo.screenWidth}x${deviceInfo.screenHeight}`,
            referrer: document.referrer || 'Direct',
            actions: []
        };
        
        // Add to visitors list (keep last 500)
        data.visitors.unshift(visitor);
        if (data.visitors.length > 500) {
            data.visitors = data.visitors.slice(0, 500);
        }
        
        // Update location stats
        const location = this.ipData.country || 'Unknown';
        data.stats.locations[location] = (data.stats.locations[location] || 0) + 1;
        
        // Update browser stats
        data.stats.browsers[browserInfo.browser] = (data.stats.browsers[browserInfo.browser] || 0) + 1;
        
        // Update device stats
        data.stats.devices[deviceInfo.device] = (data.stats.devices[deviceInfo.device] || 0) + 1;
        
        data.stats.totalSessions++;
        
        this.saveAnalyticsData(data);
        this.currentSession = visitor;
    },
    
    // Track event
    trackEvent(eventType, eventData = {}) {
        const data = this.getAnalyticsData();
        
        const event = {
            type: eventType,
            timestamp: new Date().toISOString(),
            visitorId: this.visitorId,
            sessionId: this.sessionId,
            data: eventData
        };
        
        // Add to events list (keep last 1000)
        data.events.unshift(event);
        if (data.events.length > 1000) {
            data.events = data.events.slice(0, 1000);
        }
        
        // Update feature stats
        switch (eventType) {
            case 'search':
                data.stats.features.searches++;
                break;
            case 'essay_generated':
                data.stats.features.essays++;
                break;
            case 'summary_created':
                data.stats.features.summaries++;
                break;
            case 'ai_detection':
                data.stats.features.detections++;
                break;
            case 'source_added':
                data.stats.features.sources++;
                break;
        }
        
        // Update current session actions
        if (this.currentSession) {
            const visitor = data.visitors.find(v => v.sessionId === this.sessionId);
            if (visitor) {
                visitor.actions.push({ type: eventType, time: new Date().toISOString() });
            }
        }
        
        this.saveAnalyticsData(data);
    },
    
    // Update session duration
    updateSessionDuration() {
        const data = this.getAnalyticsData();
        const visitor = data.visitors.find(v => v.sessionId === this.sessionId);
        if (visitor) {
            visitor.duration = Math.floor((Date.now() - this.sessionStart) / 1000);
            this.saveAnalyticsData(data);
        }
    },
    
    // End session
    endSession() {
        this.updateSessionDuration();
        this.trackEvent('session_end', { 
            duration: Math.floor((Date.now() - this.sessionStart) / 1000) 
        });
    },
    
    // Get analytics data from storage
    getAnalyticsData() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Error reading analytics:', e);
        }
        
        // Return default structure
        return {
            stats: {
                totalVisitors: 0,
                totalSessions: 0,
                locations: {},
                browsers: {},
                devices: {},
                features: {
                    searches: 0,
                    essays: 0,
                    summaries: 0,
                    detections: 0,
                    sources: 0
                }
            },
            visitors: [],
            events: []
        };
    },
    
    // Save analytics data
    saveAnalyticsData(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving analytics:', e);
            // If storage is full, trim old data
            if (e.name === 'QuotaExceededError') {
                data.visitors = data.visitors.slice(0, 100);
                data.events = data.events.slice(0, 200);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            }
        }
    },
    
    // Setup secret code listener
    setupSecretCodeListener() {
        document.addEventListener('keypress', (e) => {
            this.typedKeys += e.key.toLowerCase();
            
            // Keep only last N characters
            if (this.typedKeys.length > this.secretCode.length) {
                this.typedKeys = this.typedKeys.slice(-this.secretCode.length);
            }
            
            // Check if secret code typed
            if (this.typedKeys === this.secretCode) {
                this.openDashboard();
                this.typedKeys = '';
            }
        });
        
        // Also support Ctrl+Shift+A as alternative
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                this.openDashboard();
            }
        });
    },
    
    // Setup event listeners for tracking
    setupEventListeners() {
        // Close analytics panel
        document.getElementById('closeAnalytics')?.addEventListener('click', () => {
            this.closeDashboard();
        });
        
        // Export CSV
        document.getElementById('exportAnalyticsCSV')?.addEventListener('click', () => {
            this.exportToCSV();
        });
        
        // Clear data
        document.getElementById('clearAnalyticsData')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
                localStorage.removeItem(this.STORAGE_KEY);
                this.refreshDashboard();
                console.log('Analytics data cleared');
            }
        });
        
        // Close on backdrop click
        document.getElementById('analyticsPanel')?.addEventListener('click', (e) => {
            if (e.target.id === 'analyticsPanel' || e.target.classList.contains('bg-black/90')) {
                this.closeDashboard();
            }
        });
        
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDashboard();
            }
        });
    },
    
    // Open dashboard
    openDashboard() {
        const panel = document.getElementById('analyticsPanel');
        if (panel) {
            panel.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            this.refreshDashboard();
        }
    },
    
    // Close dashboard
    closeDashboard() {
        const panel = document.getElementById('analyticsPanel');
        if (panel) {
            panel.classList.add('hidden');
            document.body.style.overflow = '';
        }
    },
    
    // Refresh dashboard with current data
    refreshDashboard() {
        const data = this.getAnalyticsData();
        
        // Update summary stats
        document.getElementById('stat-totalVisitors').textContent = data.stats.totalVisitors.toLocaleString();
        document.getElementById('stat-totalSessions').textContent = data.stats.totalSessions.toLocaleString();
        document.getElementById('stat-totalSearches').textContent = data.stats.features.searches.toLocaleString();
        document.getElementById('stat-totalEssays').textContent = data.stats.features.essays.toLocaleString();
        
        // Update feature stats
        document.getElementById('feat-searches').textContent = data.stats.features.searches.toLocaleString();
        document.getElementById('feat-essays').textContent = data.stats.features.essays.toLocaleString();
        document.getElementById('feat-summaries').textContent = data.stats.features.summaries.toLocaleString();
        document.getElementById('feat-detections').textContent = data.stats.features.detections.toLocaleString();
        document.getElementById('feat-sources').textContent = data.stats.features.sources.toLocaleString();
        
        // Update top locations
        this.renderTopLocations(data.stats.locations);
        
        // Update browser stats
        this.renderStatsList('browserStats', data.stats.browsers, '🌐');
        
        // Update device stats  
        this.renderStatsList('deviceStats', data.stats.devices, '📱');
        
        // Update visitors table
        this.renderVisitorsTable(data.visitors);
        
        // Update session timeline
        this.renderSessionTimeline(data.events);
    },
    
    // Render top locations
    renderTopLocations(locations) {
        const container = document.getElementById('topLocations');
        if (!container) return;
        
        const sorted = Object.entries(locations)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (sorted.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No location data yet</p>';
            return;
        }
        
        const total = sorted.reduce((sum, [, count]) => sum + count, 0);
        
        container.innerHTML = sorted.map(([country, count]) => {
            const percentage = ((count / total) * 100).toFixed(1);
            return `
                <div class="flex justify-between items-center py-1">
                    <span class="text-gold-200/80">${this.getCountryFlag(country)} ${country}</span>
                    <div class="flex items-center gap-2">
                        <div class="w-20 h-2 bg-navy-700 rounded-full overflow-hidden">
                            <div class="h-full bg-gold-400" style="width: ${percentage}%"></div>
                        </div>
                        <span class="text-gold-400 text-sm font-semibold w-12 text-right">${count}</span>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Get country flag emoji
    getCountryFlag(country) {
        const flags = {
            'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Canada': '🇨🇦',
            'Australia': '🇦🇺', 'Germany': '🇩🇪', 'France': '🇫🇷',
            'Spain': '🇪🇸', 'Italy': '🇮🇹', 'Brazil': '🇧🇷',
            'Mexico': '🇲🇽', 'India': '🇮🇳', 'China': '🇨🇳',
            'Japan': '🇯🇵', 'South Korea': '🇰🇷', 'Netherlands': '🇳🇱',
            'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'Denmark': '🇩🇰',
            'Finland': '🇫🇮', 'Poland': '🇵🇱', 'Unknown': '🌍'
        };
        return flags[country] || '🌍';
    },
    
    // Render stats list
    renderStatsList(containerId, stats, defaultEmoji) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const sorted = Object.entries(stats)
            .sort((a, b) => b[1] - a[1]);
        
        if (sorted.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No data yet</p>';
            return;
        }
        
        const total = sorted.reduce((sum, [, count]) => sum + count, 0);
        const emojis = {
            'Chrome': '🌐', 'Firefox': '🦊', 'Safari': '🧭', 'Edge': '📐', 'Opera': '🔴',
            'Desktop': '🖥️', 'Mobile': '📱', 'Tablet': '📟'
        };
        
        container.innerHTML = sorted.map(([name, count]) => {
            const percentage = ((count / total) * 100).toFixed(1);
            const emoji = emojis[name] || defaultEmoji;
            return `
                <div class="flex justify-between items-center py-1">
                    <span class="text-gold-200/80">${emoji} ${name}</span>
                    <span class="text-gold-400 text-sm font-semibold">${count} (${percentage}%)</span>
                </div>
            `;
        }).join('');
    },
    
    // Render visitors table
    renderVisitorsTable(visitors) {
        const tbody = document.getElementById('visitorsTableBody');
        if (!tbody) return;
        
        if (visitors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-gray-500">No visitors recorded yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = visitors.slice(0, 50).map(v => {
            const time = new Date(v.timestamp).toLocaleString();
            const location = v.city && v.country ? `${v.city}, ${v.country}` : (v.country || 'Unknown');
            const actions = v.actions?.length || 0;
            
            return `
                <tr class="border-b border-gold-400/5 hover:bg-gold-400/5 transition-colors">
                    <td class="py-3 px-2 text-xs">${time}</td>
                    <td class="py-3 px-2 font-mono text-xs text-blue-400">${v.ip || 'Unknown'}</td>
                    <td class="py-3 px-2 text-xs">${this.getCountryFlag(v.country)} ${location}</td>
                    <td class="py-3 px-2 text-xs">${v.browser || 'Unknown'} ${v.browserVersion || ''}</td>
                    <td class="py-3 px-2 text-xs">${v.device || 'Unknown'} (${v.os || 'Unknown'})</td>
                    <td class="py-3 px-2 text-xs text-gold-400">${actions} actions</td>
                </tr>
            `;
        }).join('');
    },
    
    // Render session timeline
    renderSessionTimeline(events) {
        const container = document.getElementById('sessionTimeline');
        if (!container) return;
        
        if (events.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No activity recorded yet</p>';
            return;
        }
        
        const eventIcons = {
            'page_view': '👁️',
            'search': '🔍',
            'essay_generated': '✨',
            'summary_created': '📋',
            'ai_detection': '🔬',
            'source_added': '📚',
            'session_end': '👋'
        };
        
        container.innerHTML = events.slice(0, 100).map(e => {
            const time = new Date(e.timestamp).toLocaleString();
            const icon = eventIcons[e.type] || '📌';
            const details = e.data ? Object.entries(e.data).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
            
            return `
                <div class="flex items-start gap-3 py-2 border-b border-gold-400/5">
                    <span class="text-lg">${icon}</span>
                    <div class="flex-1">
                        <div class="text-gold-200/80 text-sm font-medium">${e.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                        ${details ? `<div class="text-gold-200/40 text-xs">${details}</div>` : ''}
                    </div>
                    <span class="text-xs text-gold-200/40">${time}</span>
                </div>
            `;
        }).join('');
    },
    
    // Export to CSV
    exportToCSV() {
        const data = this.getAnalyticsData();
        
        // Create CSV content
        const headers = ['Timestamp', 'IP', 'Country', 'City', 'Browser', 'Device', 'OS', 'Screen Size', 'Referrer', 'Actions Count'];
        const rows = data.visitors.map(v => [
            v.timestamp,
            v.ip,
            v.country,
            v.city,
            `${v.browser} ${v.browserVersion}`,
            v.device,
            v.os,
            v.screenSize,
            v.referrer,
            v.actions?.length || 0
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
        ].join('\n');
        
        // Download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `essaygpt-analytics-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
};

// Initialize analytics when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Analytics.init();
});

// Export for use in other files
window.Analytics = Analytics;

