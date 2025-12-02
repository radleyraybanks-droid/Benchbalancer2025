// Simple Supabase integration for BenchBalancer
// This replaces the complex API client for now

console.log('Loading BenchBalancer Supabase integration...');

// Wait for Supabase CDN to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Supabase] Checking for Supabase library...');
    console.log('[Supabase] window.supabase:', typeof window.supabase);

    if (typeof window.supabase === 'undefined') {
        console.error('❌ Supabase library not loaded - running in offline mode');
        console.error('Make sure the CDN script is loaded: <script src="https://unpkg.com/@supabase/supabase-js@2"></script>');
        return;
    }

    // Initialize Supabase client using config
    const supabaseUrl = window.SUPABASE_CONFIG?.url || 'https://pomcalscfnwsqlscunxf.supabase.co';
    const supabaseKey = window.SUPABASE_CONFIG?.anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbWNhbHNjZm53c3Fsc2N1bnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4NTExODAsImV4cCI6MjA3MjQyNzE4MH0.cEm66pBZpNct7XMwpFaKnYS3ZxH1s02hIjKXfOqBmyI';

    console.log('[Supabase] Initializing with URL:', supabaseUrl);

    let client;
    try {
        // The correct way to access createClient from the CDN
        const { createClient } = window.supabase;
        client = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });
        console.log('✅ Supabase client initialized successfully!');

        // Make client available globally
        window.benchBalancerSupabase = client;
        
        // Do not inject auth buttons on the landing page; options live inside the Sign In modal
        // addAuthButton();
        
        // Test connection
        client.from('users').select('count').then(result => {
            if (result.error) {
                console.log('⚠️ Supabase connection test failed:', result.error.message);
                console.log('Auth buttons available - will try to authenticate when clicked');
            } else {
                console.log('🔗 Supabase backend connected successfully!');
                checkCurrentUser();
            }
        }).catch(error => {
            console.log('⚠️ Connection test failed:', error.message);
            console.log('Auth buttons available - will try to authenticate when clicked');
        });
        
    } catch (error) {
        console.log('⚠️ Supabase initialization failed:', error.message);
        console.log('Running in offline mode...');
    }
});

function addAuthButton() {
    // Add authentication UI to the header
    const header = document.getElementById('appHeader');
    if (header && !document.getElementById('authContainer')) {
        const authContainer = document.createElement('div');
        authContainer.id = 'authContainer';
        authContainer.style.cssText = `
            position: absolute;
            top: 15px;
            right: 20px;
            display: flex;
            gap: 10px;
            align-items: center;
        `;
        
        // Google Sign In Button
        const googleButton = document.createElement('button');
        googleButton.id = 'googleAuthButton';
        googleButton.innerHTML = '🔐 Google Sign In';
        googleButton.style.cssText = `
            background: linear-gradient(45deg, #4285f4, #34a853);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            transition: transform 0.2s;
        `;
        
        googleButton.onmouseover = () => googleButton.style.transform = 'scale(1.05)';
        googleButton.onmouseout = () => googleButton.style.transform = 'scale(1)';
        
        googleButton.onclick = async function() {
            try {
                if (!window.benchBalancerSupabase) {
                    alert('Backend not available. Running in offline mode.');
                    return;
                }
                
                const { error } = await window.benchBalancerSupabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.href
                    }
                });
                
                if (error) {
                    console.error('Google auth error:', error.message);
                    alert('Google sign in failed: ' + error.message);
                } else {
                    console.log('🔐 Redirecting to Google for authentication...');
                }
            } catch (err) {
                console.error('Google auth error:', err);
                alert('Google sign in failed. Check console for details.');
            }
        };
        
        // Email Sign Up Button
        const emailButton = document.createElement('button');
        emailButton.id = 'emailAuthButton';
        emailButton.innerHTML = '📧 Email Sign Up';
        emailButton.style.cssText = `
            background: linear-gradient(45deg, #00FFE0, #4A90E2);
            color: #1a1a1f;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            transition: transform 0.2s;
        `;
        
        emailButton.onmouseover = () => emailButton.style.transform = 'scale(1.05)';
        emailButton.onmouseout = () => emailButton.style.transform = 'scale(1)';
        
        emailButton.onclick = function() {
            showEmailAuthModal();
        };
        
        authContainer.appendChild(googleButton);
        authContainer.appendChild(emailButton);
        header.appendChild(authContainer);
        console.log('🔐 Auth buttons added successfully!');
        
        // Flash the buttons to make them visible
        setTimeout(() => {
            googleButton.style.boxShadow = '0 0 15px rgba(66, 133, 244, 0.6)';
            emailButton.style.boxShadow = '0 0 15px rgba(0, 255, 224, 0.6)';
            setTimeout(() => {
                googleButton.style.boxShadow = '';
                emailButton.style.boxShadow = '';
            }, 2000);
        }, 500);
    }
}

// Make showEmailAuthModal available globally
window.showEmailAuthModal = function() {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: linear-gradient(135deg, #1a1a1f 0%, #2d2d35 100%);
        padding: 40px;
        border-radius: 20px;
        border: 2px solid #00FFE0;
        box-shadow: 0 20px 60px rgba(0, 255, 224, 0.4);
        max-width: 450px;
        width: 90%;
    `;

    modalContent.innerHTML = `
        <h2 style="color: #00FFE0; margin-bottom: 10px; text-align: center; font-family: 'Bebas Neue', sans-serif; font-size: 32px; letter-spacing: 0.1em;">
            🏀 BENCHBALANCER
        </h2>
        <p style="color: #B0B0B8; text-align: center; margin-bottom: 25px; font-size: 14px;">
            Sign in or create an account to track your stats
        </p>

        <!-- Google Sign In Button -->
        <button id="googleSignInBtn" style="width: 100%; background: white;
            color: #444; border: none; padding: 14px 20px; border-radius: 10px;
            cursor: pointer; font-weight: bold; margin-bottom: 15px; display: flex;
            align-items: center; justify-content: center; gap: 10px;">
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
        </button>

        <div style="text-align: center; margin: 20px 0; color: #6f829e; font-size: 13px; position: relative;">
            <span style="background: linear-gradient(135deg, #1a1a1f 0%, #2d2d35 100%); padding: 0 10px; position: relative; z-index: 1;">OR</span>
            <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.1); z-index: 0;"></div>
        </div>

        <div style="margin-bottom: 20px;">
            <input type="email" id="emailInput" placeholder="Enter your email"
                style="width: 100%; padding: 14px; border-radius: 10px; border: 1px solid rgba(0, 255, 224, 0.3);
                background: rgba(26, 26, 31, 0.8); color: white; margin-bottom: 12px; box-sizing: border-box; font-size: 14px;">

            <input type="password" id="passwordInput" placeholder="Password (6+ characters)"
                style="width: 100%; padding: 14px; border-radius: 10px; border: 1px solid rgba(0, 255, 224, 0.3);
                background: rgba(26, 26, 31, 0.8); color: white; margin-bottom: 12px; box-sizing: border-box; font-size: 14px;">

            <input type="text" id="nameInput" placeholder="Your full name (for sign up)"
                style="width: 100%; padding: 14px; border-radius: 10px; border: 1px solid rgba(0, 255, 224, 0.3);
                background: rgba(26, 26, 31, 0.8); color: white; box-sizing: border-box; font-size: 14px;">
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
            <button id="signUpBtn" style="width: 100%; background: linear-gradient(45deg, #00FFE0, #4A90E2);
                color: #1a1a1f; border: none; padding: 14px 20px; border-radius: 10px;
                cursor: pointer; font-weight: bold; font-size: 15px;">
                🚀 Sign Up
            </button>

            <button id="signInBtn" style="width: 100%; background: linear-gradient(45deg, #5CB85C, #4A90E2);
                color: white; border: none; padding: 14px 20px; border-radius: 10px;
                cursor: pointer; font-weight: bold; font-size: 15px;">
                🔓 Sign In
            </button>

            <button id="cancelBtn" style="width: 100%; background: rgba(217, 83, 79, 0.8); color: white; border: none;
                padding: 12px 20px; border-radius: 10px; cursor: pointer; font-weight: 500; font-size: 14px;">
                Cancel
            </button>
        </div>

        <p style="color: #6f829e; font-size: 12px; text-align: center; margin-top: 20px; line-height: 1.5;">
            Pro users get unlimited teams, advanced stats tracking, and cloud sync across all devices!
        </p>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Event listeners
    document.getElementById('signUpBtn').onclick = handleEmailSignUp;
    document.getElementById('signInBtn').onclick = handleEmailSignIn;
    document.getElementById('googleSignInBtn').onclick = handleGoogleSignIn;
    document.getElementById('cancelBtn').onclick = () => document.body.removeChild(modal);

    // Close on overlay click
    modal.onclick = (e) => {
        if (e.target === modal) document.body.removeChild(modal);
    };

    // Focus email input
    document.getElementById('emailInput').focus();
}

async function handleGoogleSignIn() {
    console.log('[Auth] Google sign in initiated');

    try {
        if (!window.benchBalancerSupabase) {
            console.error('[Auth] Supabase client not available');
            alert('Backend not available. Please refresh the page and try again.');
            return;
        }

        console.log('[Auth] Requesting Google OAuth...');

        const { data, error } = await window.benchBalancerSupabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                }
            }
        });

        console.log('[Auth] Google OAuth response:', { data, error });

        if (error) {
            console.error('[Auth] Google auth error:', error);
            alert('Google sign in failed: ' + error.message);
        } else {
            console.log('🔐 Redirecting to Google for authentication...');
            // The redirect will happen automatically
        }
    } catch (err) {
        console.error('[Auth] Google auth exception:', err);
        if (err.message?.includes('fetch')) {
            alert('Network error: Unable to connect to authentication server. Please check your internet connection and try again.');
        } else {
            alert('Google sign in failed: ' + (err.message || 'Unknown error. Check browser console for details.'));
        }
    }
}

async function handleEmailSignUp() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    const name = document.getElementById('nameInput').value;

    console.log('[Auth] Sign up attempt for:', email);

    if (!email || !password || !name) {
        alert('Please fill in all fields');
        return;
    }

    if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }

    try {
        if (!window.benchBalancerSupabase) {
            console.error('[Auth] Supabase client not available');
            alert('Backend not available. Please refresh the page and try again.');
            return;
        }

        console.log('[Auth] Sending sign up request...');

        const { data, error } = await window.benchBalancerSupabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name
                },
                emailRedirectTo: window.location.origin
            }
        });

        console.log('[Auth] Sign up response:', { data, error });

        if (error) {
            console.error('[Auth] Sign up error:', error);
            alert('Sign up failed: ' + error.message);
        } else {
            console.log('✅ User signed up:', data.user?.email);
            alert('🎉 Sign up successful! Check your email to confirm your account.');
            const modal = document.getElementById('authModal');
            if (modal) document.body.removeChild(modal);
        }
    } catch (err) {
        console.error('[Auth] Sign up exception:', err);
        if (err.message?.includes('fetch')) {
            alert('Network error: Unable to connect to authentication server. Please check your internet connection and try again.');
        } else {
            alert('Sign up failed: ' + (err.message || 'Unknown error'));
        }
    }
}

async function handleEmailSignIn() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    console.log('[Auth] Sign in attempt for:', email);

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        if (!window.benchBalancerSupabase) {
            console.error('[Auth] Supabase client not available');
            alert('Backend not available. Please refresh the page and try again.');
            return;
        }

        console.log('[Auth] Sending sign in request...');

        const { data, error } = await window.benchBalancerSupabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        console.log('[Auth] Sign in response:', { data, error });

        if (error) {
            console.error('[Auth] Sign in error:', error);
            alert('Sign in failed: ' + error.message);
        } else {
            console.log('✅ User signed in:', data.user?.email);
            alert('🎉 Welcome back! You are now signed in.');
            const modal = document.getElementById('authModal');
            if (modal) document.body.removeChild(modal);
            updateAuthUI(data.user);
        }
    } catch (err) {
        console.error('[Auth] Sign in exception:', err);
        if (err.message?.includes('fetch')) {
            alert('Network error: Unable to connect to authentication server. Please check your internet connection and try again.');
        } else {
            alert('Sign in failed: ' + (err.message || 'Unknown error'));
        }
    }
}

async function checkCurrentUser() {
    if (!window.benchBalancerSupabase) return;
    
    try {
        const { data: { user } } = await window.benchBalancerSupabase.auth.getUser();
        if (user) {
            console.log('✅ User already signed in:', user.email);
            updateAuthUI(user);
        }
    } catch (error) {
        console.log('User check failed:', error.message);
    }
}

function updateAuthUI(user) {
    if (user) {
        const authContainer = document.getElementById('authContainer');
        if (authContainer) {
            authContainer.innerHTML = `
                <div style="color: #00FFE0; font-size: 12px; text-align: right;">
                    <div>👋 ${user.user_metadata?.full_name || user.email}</div>
                    <button id="signOutBtn" style="background: #D9534F; color: white; border: none; 
                        padding: 4px 8px; border-radius: 10px; cursor: pointer; font-size: 10px; margin-top: 2px;">
                        Sign Out
                    </button>
                </div>
            `;
            
            document.getElementById('signOutBtn').onclick = async () => {
                await window.benchBalancerSupabase.auth.signOut();
                location.reload();
            };
        }
    }
}

// Simple API interface that works offline and online
window.BenchBalancerAPI = {
    async isConnected() {
        return !!window.benchBalancerSupabase;
    },
    
    async getCurrentUser() {
        if (!window.benchBalancerSupabase) return null;
        const { data: { user } } = await window.benchBalancerSupabase.auth.getUser();
        return user;
    },
    
    async createTempMatch(matchData) {
        if (!window.benchBalancerSupabase) {
            console.log('Creating match offline...');
            return { id: 'offline_' + Date.now(), ...matchData };
        }
        
        const { data, error } = await window.benchBalancerSupabase
            .from('temp_matches')
            .insert({
                session_id: 'session_' + Date.now(),
                match_data: matchData
            })
            .select()
            .single();
        
        if (error) throw error;
        console.log('✅ Match created in Supabase:', data.id);
        return data;
    }
};

console.log('✅ BenchBalancer API ready!');