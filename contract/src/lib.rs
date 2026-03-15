#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, token,
};

const MAX_MSG:      u32 = 120;
const MAX_NAME:     u32 = 60;
const MAX_BIO:      u32 = 160;
const MAX_TIPS_LOG: u32 = 50;   // keep last 50 tips in history

#[contracttype]
#[derive(Clone)]
pub struct Tip {
    pub tipper:    Address,
    pub amount:    i128,
    pub message:   String,
    pub ledger:    u32,
}

#[contracttype]
#[derive(Clone)]
pub struct CreatorProfile {
    pub owner:       Address,
    pub name:        String,
    pub bio:         String,
    pub total_tips:  i128,
    pub tip_count:   u32,
    pub balance:     i128,  // unclaimed XLM in contract
}

#[contracttype]
pub enum DataKey {
    Profile,
    TipLog,
}

#[contract]
pub struct TipJarContract;

#[contractimpl]
impl TipJarContract {
    /// Owner sets up their profile (call once after deploy)
    pub fn setup(
        env: Env,
        owner: Address,
        name: String,
        bio: String,
    ) {
        owner.require_auth();
        assert!(name.len() > 0 && name.len() <= MAX_NAME, "Name 1–60 chars");
        assert!(bio.len() <= MAX_BIO, "Bio max 160 chars");
        // Allow re-setup only by owner
        if let Some(existing) = env.storage().instance()
            .get::<DataKey, CreatorProfile>(&DataKey::Profile)
        {
            assert!(existing.owner == owner, "Not the owner");
        }

        let profile = CreatorProfile {
            owner,
            name,
            bio,
            total_tips: 0,
            tip_count: 0,
            balance: 0,
        };
        env.storage().instance().set(&DataKey::Profile, &profile);
    }

    /// Anyone sends a tip with an optional message
    pub fn tip(
        env: Env,
        tipper: Address,
        amount: i128,
        message: String,
        xlm_token: Address,
    ) {
        tipper.require_auth();
        assert!(amount >= 1_000_000, "Min tip 0.1 XLM");
        assert!(message.len() <= MAX_MSG, "Message max 120 chars");

        let mut profile: CreatorProfile = env.storage().instance()
            .get(&DataKey::Profile).expect("Jar not set up yet");

        assert!(profile.owner != tipper, "Cannot tip yourself");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&tipper, &env.current_contract_address(), &amount);

        profile.total_tips += amount;
        profile.tip_count  += 1;
        profile.balance    += amount;
        env.storage().instance().set(&DataKey::Profile, &profile);

        // Append to tip log, trim to last 50
        let mut log: Vec<Tip> = env.storage().instance()
            .get(&DataKey::TipLog).unwrap_or(Vec::new(&env));

        let t = Tip {
            tipper,
            amount,
            message,
            ledger: env.ledger().sequence(),
        };
        log.push_back(t);
        while log.len() > MAX_TIPS_LOG { log.remove(0); }
        env.storage().instance().set(&DataKey::TipLog, &log);

        env.events().publish(
            (symbol_short!("tipped"),),
            (profile.owner, amount),
        );
    }

    /// Owner withdraws all accumulated tips
    pub fn withdraw(env: Env, owner: Address, xlm_token: Address) {
        owner.require_auth();

        let mut profile: CreatorProfile = env.storage().instance()
            .get(&DataKey::Profile).expect("Jar not set up");

        assert!(profile.owner == owner, "Not the owner");
        assert!(profile.balance > 0, "Nothing to withdraw");

        let payout = profile.balance;
        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&env.current_contract_address(), &owner, &payout);

        profile.balance = 0;
        env.storage().instance().set(&DataKey::Profile, &profile);
        env.events().publish((symbol_short!("withdrawn"),), (owner, payout));
    }

    // ── Reads ──────────────────────────────────────────────────────────────
    pub fn get_profile(env: Env) -> CreatorProfile {
        env.storage().instance()
            .get(&DataKey::Profile).expect("Jar not set up")
    }

    pub fn get_tips(env: Env) -> Vec<Tip> {
        env.storage().instance()
            .get(&DataKey::TipLog).unwrap_or(Vec::new(&env))
    }
}
