// BenchBalancer Supabase Configuration
// Replace these values with your actual Supabase project credentials

const SUPABASE_CONFIG = {
  // From Settings > API in your Supabase dashboard
  url: 'https://pomcalscfnwsqlscunxf.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbWNhbHNjZm53c3Fsc2N1bnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4NTExODAsImV4cCI6MjA3MjQyNzE4MH0.cEm66pBZpNct7XMwpFaKnYS3ZxH1s02hIjKXfOqBmyI',
  serviceRoleKey: 'sb_secret_sVTIObz3ef3JgrmYAP8MWw_AdNI9LP-',
  jwtSecret: 'your-jwt-secret-here' // We'll get this from JWT Keys section
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SUPABASE_CONFIG
} else {
  window.SUPABASE_CONFIG = SUPABASE_CONFIG
}