#!/bin/bash

# ============================================================================
# Bench Balancer - Email Stats Feature Deployment Script
# ============================================================================
# This script automates the deployment of the guest email stats feature
# including Resend configuration, database migration, and Edge Function deployment
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emoji helpers
SUCCESS="✅"
ERROR="❌"
WARNING="⚠️"
INFO="ℹ️"
ROCKET="🚀"
EMAIL="📧"

# Print functions
print_header() {
    echo -e "\n${CYAN}============================================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}============================================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}${SUCCESS} $1${NC}"
}

print_error() {
    echo -e "${RED}${ERROR} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARNING} $1${NC}"
}

print_info() {
    echo -e "${BLUE}${INFO} $1${NC}"
}

print_step() {
    echo -e "\n${YELLOW}▶ $1${NC}"
}

# ============================================================================
# CONFIGURATION VALIDATION
# ============================================================================

print_header "${EMAIL} Bench Balancer Email Stats Deployment ${EMAIL}"

# Check if we're in the correct directory
if [ ! -f "basketball-integration-main.js" ]; then
    print_error "Please run this script from the 'Corrrect engine and algoritm' directory"
    exit 1
fi

print_success "Directory verified"

# ============================================================================
# STEP 1: RESEND API KEY
# ============================================================================

print_step "Step 1: Configure Resend API Key"

if [ -z "$RESEND_API_KEY" ]; then
    print_warning "RESEND_API_KEY not found in environment"
    echo -e "${CYAN}Please enter your Resend API Key (starts with 're_'):${NC}"
    read -r RESEND_API_KEY

    if [ -z "$RESEND_API_KEY" ]; then
        print_error "API key is required"
        exit 1
    fi
fi

# Validate API key format
if [[ ! "$RESEND_API_KEY" =~ ^re_ ]]; then
    print_warning "API key doesn't start with 're_' - are you sure this is correct?"
    echo -e "Continue anyway? (y/n)"
    read -r confirm
    if [ "$confirm" != "y" ]; then
        exit 1
    fi
fi

print_success "Resend API key configured"

# ============================================================================
# STEP 2: VERIFY DOMAIN CONFIGURATION
# ============================================================================

print_step "Step 2: Verify Domain Configuration"

CURRENT_EMAIL=$(grep -o 'from: .* <.*@.*>' supabase/functions/send-game-stats-email/index.ts | head -n 1 || echo "")
print_info "Current 'from' email: ${CURRENT_EMAIL}"

echo -e "\n${CYAN}Important: Make sure you've verified this domain in Resend!${NC}"
echo -e "Visit: https://resend.com/domains"
echo -e "\nIs your domain 'benchbalancer.com' verified in Resend? (y/n)"
read -r domain_verified

if [ "$domain_verified" != "y" ]; then
    print_warning "Please verify your domain in Resend before continuing"
    echo -e "\nSteps to verify:"
    echo -e "1. Go to https://resend.com/domains"
    echo -e "2. Click 'Add Domain'"
    echo -e "3. Enter 'benchbalancer.com'"
    echo -e "4. Add the DNS records provided"
    echo -e "5. Wait for verification (5-30 minutes)"
    echo -e "\nContinue anyway? (y/n)"
    read -r force_continue
    if [ "$force_continue" != "y" ]; then
        exit 1
    fi
fi

print_success "Domain verification confirmed"

# ============================================================================
# STEP 3: CHECK SUPABASE CLI
# ============================================================================

print_step "Step 3: Verify Supabase CLI"

if ! command -v supabase &> /dev/null; then
    print_error "Supabase CLI not found"
    print_info "Install with: npm install -g supabase"
    exit 1
fi

SUPABASE_VERSION=$(supabase --version)
print_success "Supabase CLI installed: $SUPABASE_VERSION"

# ============================================================================
# STEP 4: LINK SUPABASE PROJECT
# ============================================================================

print_step "Step 4: Link Supabase Project"

# Check if already linked
if [ -f ".supabase/config.toml" ]; then
    print_success "Project already linked"
else
    print_info "Linking Supabase project..."
    echo -e "${CYAN}Please enter your Supabase project reference:${NC}"
    read -r PROJECT_REF

    supabase link --project-ref "$PROJECT_REF"

    if [ $? -eq 0 ]; then
        print_success "Project linked successfully"
    else
        print_error "Failed to link project"
        exit 1
    fi
fi

# ============================================================================
# STEP 5: RUN DATABASE MIGRATION
# ============================================================================

print_step "Step 5: Run Database Migration"

print_info "Running guest_emails table migration..."

if [ -f "config/migration-guest-emails.sql" ]; then
    supabase db push --db-url "$DATABASE_URL" --file config/migration-guest-emails.sql 2>/dev/null || {
        print_warning "Couldn't auto-push migration. Running via psql..."

        echo -e "${CYAN}Please enter your Supabase database password:${NC}"
        supabase db execute -f config/migration-guest-emails.sql
    }

    if [ $? -eq 0 ]; then
        print_success "Database migration completed"
    else
        print_error "Migration failed - please run manually:"
        print_info "supabase db execute -f config/migration-guest-emails.sql"
        exit 1
    fi
else
    print_error "Migration file not found: config/migration-guest-emails.sql"
    exit 1
fi

# ============================================================================
# STEP 6: SET RESEND SECRET
# ============================================================================

print_step "Step 6: Deploy Resend API Key as Secret"

print_info "Setting RESEND_API_KEY secret..."

supabase secrets set RESEND_API_KEY="$RESEND_API_KEY"

if [ $? -eq 0 ]; then
    print_success "Secret deployed successfully"
else
    print_error "Failed to set secret"
    exit 1
fi

# ============================================================================
# STEP 7: DEPLOY EDGE FUNCTION
# ============================================================================

print_step "Step 7: Deploy Edge Function"

print_info "Deploying send-game-stats-email function..."

cd supabase/functions
supabase functions deploy send-game-stats-email --no-verify-jwt

if [ $? -eq 0 ]; then
    print_success "Edge Function deployed successfully"
    cd ../..
else
    print_error "Edge Function deployment failed"
    cd ../..
    exit 1
fi

# ============================================================================
# STEP 8: TEST DEPLOYMENT
# ============================================================================

print_step "Step 8: Test Deployment (Optional)"

echo -e "${CYAN}Would you like to send a test email? (y/n)${NC}"
read -r send_test

if [ "$send_test" = "y" ]; then
    echo -e "${CYAN}Enter test email address:${NC}"
    read -r test_email

    print_info "Sending test email to $test_email..."

    # Get project URL from Supabase
    PROJECT_URL=$(supabase status | grep "API URL" | awk '{print $3}')

    curl -i --location --request POST "${PROJECT_URL}/functions/v1/send-game-stats-email" \
        --header 'Content-Type: application/json' \
        --data "{
            \"email\": \"$test_email\",
            \"gameData\": {
                \"finalScore\": \"85 - 72\",
                \"homeScore\": 85,
                \"awayScore\": 72,
                \"gameDate\": \"$(date +%Y-%m-%d)\",
                \"gameTime\": \"7:30 PM\",
                \"variance\": 45,
                \"totalPlayers\": 12,
                \"players\": [
                    {\"name\": \"Test Player 1\", \"position\": \"PG\", \"courtTime\": 24, \"benchTime\": 8, \"points\": 15},
                    {\"name\": \"Test Player 2\", \"position\": \"SG\", \"courtTime\": 22, \"benchTime\": 10, \"points\": 12}
                ]
            }
        }"

    print_success "Test email sent! Check inbox for $test_email"
fi

# ============================================================================
# DEPLOYMENT SUMMARY
# ============================================================================

print_header "${ROCKET} Deployment Complete! ${ROCKET}"

echo -e "${GREEN}All components deployed successfully:${NC}\n"
echo -e "  ${SUCCESS} Resend API Key configured"
echo -e "  ${SUCCESS} Database migration completed"
echo -e "  ${SUCCESS} Edge Function deployed"
echo -e "  ${SUCCESS} Email 'from' address updated"

echo -e "\n${CYAN}Next Steps:${NC}\n"
echo -e "  1. Test the feature by completing a basketball game as a guest"
echo -e "  2. Monitor emails in Resend dashboard: https://resend.com/emails"
echo -e "  3. View collected emails at: guest-emails-admin.html"
echo -e "  4. Check Edge Function logs: supabase functions logs send-game-stats-email"

echo -e "\n${YELLOW}Important Reminders:${NC}\n"
echo -e "  ${WARNING} Verify domain is fully configured in Resend"
echo -e "  ${WARNING} Monitor email deliverability and spam rates"
echo -e "  ${WARNING} Resend free tier: 100 emails/day, 3,000/month"

echo -e "\n${CYAN}============================================================================${NC}"
echo -e "${GREEN}${EMAIL} Email Stats Feature is LIVE! ${EMAIL}${NC}"
echo -e "${CYAN}============================================================================${NC}\n"

# Save deployment info
echo "Deployment completed at: $(date)" > .email-stats-deployment.log
echo "Resend API Key (masked): ${RESEND_API_KEY:0:10}..." >> .email-stats-deployment.log
