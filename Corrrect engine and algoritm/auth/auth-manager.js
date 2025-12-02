/**
 * Authentication Manager for Pro Management System
 * Handles user authentication, session management, and role-based access
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.session = null;
        this.supabaseClient = null;
        
        this.init();
    }
    
    async init() {
        console.log('[AuthManager] Initializing authentication system');
        
        try {
            await this.initializeSupabase();
            await this.checkExistingSession();
            this.setupAuthListeners();
        } catch (error) {
            console.error('[AuthManager] Initialization failed:', error);
        }
    }
    
    async initializeSupabase() {
        // Use the globally initialized Supabase client
        if (window.benchBalancerSupabase) {
            this.supabaseClient = window.benchBalancerSupabase;
            console.log('[AuthManager] Using global Supabase client');
        } else if (window.supabase && window.supabaseConfig) {
            // Fallback: create client if global one doesn't exist
            try {
                const { createClient } = window.supabase;
                this.supabaseClient = createClient(
                    window.supabaseConfig.url,
                    window.supabaseConfig.anonKey
                );
                console.log('[AuthManager] Supabase client initialized');
            } catch (error) {
                console.error('[AuthManager] Error initializing Supabase:', error);
                this.useMockAuth = true;
            }
        } else {
            console.warn('[AuthManager] Supabase not available, using mock authentication');
            this.useMockAuth = true;
        }
    }
    
    async checkExistingSession() {
        try {
            if (this.supabaseClient) {
                const { data: { session }, error } = await this.supabaseClient.auth.getSession();
                
                if (error) {
                    console.error('[AuthManager] Session check failed:', error);
                    return null;
                }
                
                if (session) {
                    this.session = session;
                    this.currentUser = session.user;
                    console.log('[AuthManager] Existing session found:', session.user.email);
                    return session;
                }
            } else if (this.useMockAuth) {
                const mockSession = this.getMockSession();
                if (mockSession) {
                    this.session = mockSession;
                    this.currentUser = mockSession.user;
                    return mockSession;
                }
            }
            
            console.log('[AuthManager] No existing session found');
            return null;
        } catch (error) {
            console.error('[AuthManager] Error checking session:', error);
            return null;
        }
    }
    
    setupAuthListeners() {
        if (this.supabaseClient) {
            this.supabaseClient.auth.onAuthStateChange((event, session) => {
                console.log('[AuthManager] Auth state changed:', event);
                
                this.session = session;
                this.currentUser = session?.user || null;
                
                this.handleAuthStateChange(event, session);
            });
        }
    }
    
    handleAuthStateChange(event, session) {
        switch (event) {
            case 'SIGNED_IN':
                console.log('[AuthManager] User signed in:', session.user.email);
                this.onSignIn(session);
                break;
                
            case 'SIGNED_OUT':
                console.log('[AuthManager] User signed out');
                this.onSignOut();
                break;
                
            case 'TOKEN_REFRESHED':
                console.log('[AuthManager] Token refreshed');
                break;
                
            default:
                console.log('[AuthManager] Auth event:', event);
        }
    }
    
    onSignIn(session) {
        if (typeof proManager !== 'undefined') {
            proManager.isAuthenticated = true;
            proManager.currentCoach = session.user;
            proManager.updateUserDisplay();
        }
    }
    
    onSignOut() {
        if (typeof proManager !== 'undefined') {
            proManager.isAuthenticated = false;
            proManager.currentCoach = null;
        }
    }
    
    async signIn(email, password) {
        try {
            if (this.supabaseClient) {
                const { data, error } = await this.supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) {
                    throw error;
                }
                
                console.log('[AuthManager] Sign in successful:', data.user.email);
                return { success: true, user: data.user, session: data.session };
            } else {
                return this.mockSignIn(email, password);
            }
        } catch (error) {
            console.error('[AuthManager] Sign in failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async signUp(email, password, metadata = {}) {
        try {
            if (this.supabaseClient) {
                const { data, error } = await this.supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: metadata
                    }
                });
                
                if (error) {
                    throw error;
                }
                
                console.log('[AuthManager] Sign up successful:', data.user?.email);
                return { success: true, user: data.user, session: data.session };
            } else {
                return this.mockSignUp(email, password, metadata);
            }
        } catch (error) {
            console.error('[AuthManager] Sign up failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async signInWithGoogle() {
        try {
            if (this.supabaseClient) {
                const { data, error } = await this.supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.origin + '/pro-management-system/'
                    }
                });
                
                if (error) {
                    throw error;
                }
                
                console.log('[AuthManager] Google sign in initiated');
                return { success: true, data: data };
            } else {
                return this.mockGoogleSignIn();
            }
        } catch (error) {
            console.error('[AuthManager] Google sign in failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async signOut() {
        try {
            if (this.supabaseClient) {
                const { error } = await this.supabaseClient.auth.signOut();
                
                if (error) {
                    throw error;
                }
                
                console.log('[AuthManager] Sign out successful');
            } else {
                this.mockSignOut();
            }
            
            this.currentUser = null;
            this.session = null;
            
            return { success: true };
        } catch (error) {
            console.error('[AuthManager] Sign out failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async resetPassword(email) {
        try {
            if (this.supabaseClient) {
                const { data, error } = await this.supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/pro-management-system/reset-password'
                });
                
                if (error) {
                    throw error;
                }
                
                console.log('[AuthManager] Password reset email sent');
                return { success: true };
            } else {
                return this.mockResetPassword(email);
            }
        } catch (error) {
            console.error('[AuthManager] Password reset failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getSession() {
        if (this.session) {
            return this.session;
        }
        
        return await this.checkExistingSession();
    }
    
    getCurrentUser() {
        return this.currentUser;
    }
    
    isAuthenticated() {
        return !!this.session && !!this.currentUser;
    }
    
    hasRole(role) {
        if (!this.currentUser) return false;
        
        const userRole = this.currentUser.user_metadata?.role || 'coach';
        
        switch (role) {
            case 'admin':
                return userRole === 'admin';
            case 'head_coach':
                return ['admin', 'head_coach'].includes(userRole);
            case 'coach':
                return ['admin', 'head_coach', 'coach'].includes(userRole);
            default:
                return true;
        }
    }
    
    getCoachName() {
        if (!this.currentUser) return null;
        
        return this.currentUser.user_metadata?.name || 
               this.currentUser.user_metadata?.full_name ||
               this.currentUser.email?.split('@')[0] ||
               'Coach';
    }
    
    // Mock authentication methods for development/testing
    mockSignIn(email, password) {
        console.log('[AuthManager] Mock sign in:', email);
        
        if (email && password) {
            const mockUser = {
                id: '12345',
                email: email,
                user_metadata: {
                    name: 'Demo Coach',
                    role: 'coach'
                }
            };
            
            const mockSession = {
                user: mockUser,
                access_token: 'mock_token',
                refresh_token: 'mock_refresh'
            };
            
            this.currentUser = mockUser;
            this.session = mockSession;
            
            this.storeMockSession(mockSession);
            
            return { success: true, user: mockUser, session: mockSession };
        }
        
        return { success: false, error: 'Invalid credentials' };
    }
    
    mockSignUp(email, password, metadata) {
        console.log('[AuthManager] Mock sign up:', email);
        
        if (email && password) {
            const mockUser = {
                id: '12345',
                email: email,
                user_metadata: {
                    name: metadata.name || 'New Coach',
                    role: metadata.role || 'coach'
                }
            };
            
            const mockSession = {
                user: mockUser,
                access_token: 'mock_token',
                refresh_token: 'mock_refresh'
            };
            
            this.currentUser = mockUser;
            this.session = mockSession;
            
            this.storeMockSession(mockSession);
            
            return { success: true, user: mockUser, session: mockSession };
        }
        
        return { success: false, error: 'Invalid registration data' };
    }
    
    mockGoogleSignIn() {
        console.log('[AuthManager] Mock Google sign in');
        
        const mockUser = {
            id: '12345',
            email: 'coach@example.com',
            user_metadata: {
                name: 'Google Coach',
                role: 'coach',
                provider: 'google'
            }
        };
        
        const mockSession = {
            user: mockUser,
            access_token: 'mock_google_token',
            refresh_token: 'mock_google_refresh'
        };
        
        this.currentUser = mockUser;
        this.session = mockSession;
        
        this.storeMockSession(mockSession);
        
        // Simulate redirect
        setTimeout(() => {
            this.onSignIn(mockSession);
        }, 500);
        
        return { success: true, data: { url: '#' } };
    }
    
    mockSignOut() {
        console.log('[AuthManager] Mock sign out');
        
        this.currentUser = null;
        this.session = null;
        
        localStorage.removeItem('pro_mock_session');
    }
    
    mockResetPassword(email) {
        console.log('[AuthManager] Mock password reset:', email);
        return { success: true };
    }
    
    storeMockSession(session) {
        localStorage.setItem('pro_mock_session', JSON.stringify(session));
    }
    
    getMockSession() {
        const stored = localStorage.getItem('pro_mock_session');
        return stored ? JSON.parse(stored) : null;
    }
}

// Make AuthManager globally available
window.AuthManager = AuthManager;