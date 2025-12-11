// Simple Supabase integration for BenchBalancer
// This replaces the complex API client for now

console.log('Loading BenchBalancer Supabase integration...');

// Initialize Supabase Client
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Loading BenchBalancer Supabase integration...');
    console.log('📍 Current URL:', window.location.href);

    // FIX: Check for double hash (##) which breaks Supabase parsing
    if (window.location.hash && window.location.hash.startsWith('##')) {
        console.log('🔧 Fixing malformed double-hash in URL...');
        const fixedHash = window.location.hash.substring(1); // Remove first #
        history.replaceState(null, null, window.location.pathname + window.location.search + fixedHash);
        // Force reload to let Supabase client pick up the correct hash
        window.location.reload();
        return;
    }

    console.log('📍 URL Hash:', window.location.hash);

    // Check if we were waiting for a magic link
    if (localStorage.getItem('benchbalancer_magic_link_pending') === 'true') {
        console.log('🕵️‍♂️ Magic link return detected via local storage flag.');
        if (!window.location.hash) {
            console.warn('⚠️ Magic link flag set but NO hash found in URL. Redirect might have stripped it.');
        }
        // Clear the flag
        localStorage.removeItem('benchbalancer_magic_link_pending');
    }

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

        // Listen for auth state changes (this handles the redirect back from Google and Magic Links)
        client.auth.onAuthStateChange((event, session) => {
            console.log('[Supabase] Auth state changed:', event);
            if (session?.user) {
                console.log('✅ User authenticated:', session.user.email);
                updateAuthUI(session.user);

                // If we just signed in via Magic Link, we might want to clear the hash
                if (window.location.hash && window.location.hash.includes('access_token')) {
                    console.log('🧹 Clearing auth hash from URL');
                    history.replaceState(null, null, window.location.pathname + window.location.search);
                }

                // Check for sport param and redirect if needed (e.g. if we landed on index.html but meant to go to soccer)
                const params = new URLSearchParams(window.location.search);
                const sport = params.get('sport');
                if (sport === 'soccer' && !window.location.pathname.includes('soccer')) {
                    console.log('⚽ Redirecting to Soccer app...');
                    window.location.href = 'soccer-game-modern.html?sport=soccer';
                } else if (sport === 'oztag' && !window.location.pathname.includes('oztag')) {
                    console.log('🏉 Redirecting to Oztag app...');
                    window.location.href = 'oztag-setup.html?sport=oztag';
                } else if (sport === 'basketball' && window.location.pathname.includes('index.html')) {
                    // Ensure we show the basketball section if we are on index
                    if (typeof revealBasketballLanding === 'function') {
                        revealBasketballLanding();
                    }
                }

            } else {
                console.log('ℹ️ No active session');
            }
        });

        // Check for hash fragment with auth token (Magic Link handling)
        if (window.location.hash && window.location.hash.includes('access_token')) {
            console.log('🔗 Detected auth token in URL hash, processing...');
            // The Supabase client automatically detects this, but we log it for debugging
        }

        // Test connection
        client.from('users').select('count').then(result => {
            if (result.error) {
                console.log('⚠️ Supabase connection test failed:', result.error.message);
                console.log('Auth buttons available - will try to authenticate when clicked');
            } else {
                console.log('🔗 Supabase backend connected successfully!');
                // checkCurrentUser(); // No longer needed as onAuthStateChange handles it
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

        googleButton.onclick = async function () {
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

        emailButton.onclick = function () {
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
window.showEmailAuthModal = function () {
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
        <h2 style="margin-bottom: 10px; text-align: center;">
            <img src="assets/bench-balancer-neon-logo.png" alt="Bench Balancer" style="height: 50px; width: auto;">
        </h2>
        <p style="color: #B0B0B8; text-align: center; margin-bottom: 25px; font-size: 14px;">
            Sign in or create an account to track your stats
        </p>

        <!--Google Sign In Button-->
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
            
            <div style="display: flex; gap: 10px; margin-top: 5px;">
                <button id="magicLinkBtn" style="flex: 1; background: transparent; color: #00FFE0; border: 1px solid #00FFE0;
                    padding: 8px; border-radius: 10px; cursor: pointer; font-weight: 500; font-size: 12px;">
                    ✨ Send Magic Link
                </button>
                <button id="resendBtn" style="flex: 1; background: transparent; color: #6f829e; border: 1px solid #6f829e;
                    padding: 8px; border-radius: 10px; cursor: pointer; font-weight: 500; font-size: 12px;">
                    Resend Confirmation
                </button>
            </div>
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
    document.getElementById('resendBtn').onclick = handleResendConfirmation;
    document.getElementById('magicLinkBtn').onclick = handleMagicLinkSignIn;

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
                redirectTo: window.location.href, // Preserve current URL (including ?sport=basketball)
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
        } else if (data.session) {
            // Auto sign-in (Email confirmation disabled in Supabase)
            console.log('✅ User signed up and auto-signed in:', data.user?.email);
            alert('🎉 Sign up successful! You are now signed in.');
            const modal = document.getElementById('authModal');
            if (modal) document.body.removeChild(modal);
            updateAuthUI(data.user);
        } else {
            // Email confirmation required
            console.log('✅ User signed up, awaiting confirmation:', data.user?.email);
            alert('🎉 Sign up successful! Please check your email (including Spam/Junk folder) to confirm your account.\n\nNote: Default Supabase emails can sometimes be delayed or blocked.');
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
            if (error.message.includes('Email not confirmed')) {
                alert('⚠️ Email not confirmed.\n\nPlease check your inbox (and Spam/Junk folder) for the confirmation link.\n\nIf you just signed up, it might take a minute to arrive.');
            } else if (error.message.includes('Invalid login credentials')) {
                alert('❌ Invalid email or password.\n\nIf you signed up with Google, please use the "Continue with Google" button instead.');
            } else {
                alert('Sign in failed: ' + error.message);
            }
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

async function handleMagicLinkSignIn() {
    const email = document.getElementById('emailInput').value;

    if (!email) {
        alert('Please enter your email address first.');
        return;
    }

    try {
        if (!window.benchBalancerSupabase) {
            alert('Backend not available.');
            return;
        }

        console.log('[Auth] Sending Magic Link to:', email);

        // Set a flag so we know we're expecting a magic link return
        localStorage.setItem('benchbalancer_magic_link_pending', 'true');

        const { error } = await window.benchBalancerSupabase.auth.signInWithOtp({
            email: email,
            options: {
                // Use origin only to avoid query param issues stripping the hash
                emailRedirectTo: window.location.origin
            }
        });

        if (error) {
            console.error('[Auth] Magic Link error:', error);
            alert('Failed to send Magic Link: ' + error.message);
            localStorage.removeItem('benchbalancer_magic_link_pending');
        } else {
            alert('✨ Magic Link sent!\n\nCheck your email for a login link. It works like a password-free sign in.');
        }
    } catch (err) {
        console.error('[Auth] Magic Link exception:', err);
        alert('Error: ' + err.message);
        localStorage.removeItem('benchbalancer_magic_link_pending');
    }
}

async function handleResendConfirmation() {
    const email = document.getElementById('emailInput').value;

    if (!email) {
        alert('Please enter your email address first.');
        return;
    }

    try {
        if (!window.benchBalancerSupabase) {
            alert('Backend not available.');
            return;
        }

        console.log('[Auth] Resending confirmation to:', email);

        const { error } = await window.benchBalancerSupabase.auth.resend({
            type: 'signup',
            email: email,
            options: {
                emailRedirectTo: window.location.origin
            }
        });

        if (error) {
            console.error('[Auth] Resend error:', error);
            alert('Failed to resend: ' + error.message);
        } else {
            alert('✅ Confirmation email resent!\n\nPlease check your inbox and spam folder again in a few moments.');
        }
    } catch (err) {
        console.error('[Auth] Resend exception:', err);
        alert('Error: ' + err.message);
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
    if (!user) return;

    console.log('Updating UI for user:', user.email);

    // 1. Update Landing Page Button
    const landingSignInBtn = document.getElementById('landingSignInButton');
    if (landingSignInBtn) {
        const name = user.user_metadata?.full_name || user.email.split('@')[0];
        landingSignInBtn.innerHTML = `👋 ${name}`;
        landingSignInBtn.title = "Click to Sign Out";
        landingSignInBtn.style.background = 'rgba(0, 255, 224, 0.15)';
        landingSignInBtn.style.color = '#00FFE0';
        landingSignInBtn.style.borderColor = '#00FFE0';

        // Change click handler to sign out
        landingSignInBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('Do you want to sign out?')) {
                await window.benchBalancerSupabase.auth.signOut();
                window.location.reload();
            }
        };
    }

    // 2. Update Landing Page "Squad Management" Button
    const squadBtn = document.getElementById('landingSquadButton');
    if (squadBtn) {
        if (user) {
            squadBtn.innerHTML = 'Enter Dashboard';
            squadBtn.onclick = () => window.location.href = 'pro-dashboard.html';
        } else {
            squadBtn.innerHTML = 'Squad Management';
            squadBtn.onclick = () => showEmailAuthModal();
        }
    }

    // 3. Update Generic Sign In Button (e.g. Oztag Setup)
    const genericSignInBtn = document.getElementById('signInButton');
    if (genericSignInBtn) {
        const name = user.user_metadata?.full_name || user.email.split('@')[0];
        genericSignInBtn.innerHTML = `👋 ${name}`;
        genericSignInBtn.title = "Click to Sign Out";
        genericSignInBtn.style.background = 'rgba(0, 255, 224, 0.15)';
        genericSignInBtn.style.color = '#00FFE0';
        genericSignInBtn.style.border = '1px solid #00FFE0';

        genericSignInBtn.onclick = async (e) => {
            e.preventDefault();
            if (confirm('Do you want to sign out?')) {
                await window.benchBalancerSupabase.auth.signOut();
                window.location.reload();
            }
        };
    }

    // 3. Close modal if open
    const modal = document.getElementById('authModal');
    if (modal) document.body.removeChild(modal);
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