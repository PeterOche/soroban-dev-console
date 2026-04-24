#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

#[contracttype]
pub enum DataKey {
    Admin,
    Balance(Address),
}

#[contract]
pub struct TokenFixture;

#[contractimpl]
impl TokenFixture {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn balance(env: Env, account: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(account))
            .unwrap_or(0)
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin must be initialized");
        admin.require_auth();

        let next_balance = Self::balance(env.clone(), to.clone()) + amount;
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &next_balance);
        env.events()
            .publish((symbol_short!("mint"), to), amount);
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        let from_balance = Self::balance(env.clone(), from.clone());
        assert!(from_balance >= amount, "insufficient balance");

        let to_balance = Self::balance(env.clone(), to.clone());

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(to_balance + amount));
        env.events()
            .publish((symbol_short!("transfer"), from, to), amount);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Events}, Address, Env};

    fn setup() -> (Env, TokenFixtureClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.init(&admin);
        // SAFETY: env lifetime is tied to the returned client; caller must not drop env before client
        let client = unsafe {
            core::mem::transmute::<TokenFixtureClient<'_>, TokenFixtureClient<'static>>(client)
        };
        (env, client, admin)
    }

    #[test]
    fn token_fixture_can_init_and_mint() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        client.init(&admin);
        client.mint(&recipient, &150);

        assert_eq!(client.balance(&recipient), 150);
    }

    #[test]
    fn token_fixture_can_transfer_balances() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        client.init(&admin);
        client.mint(&sender, &200);
        client.transfer(&sender, &recipient, &75);

        assert_eq!(client.balance(&sender), 125);
        assert_eq!(client.balance(&recipient), 75);
    }

    #[test]
    fn mint_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        client.init(&admin);
        client.mint(&recipient, &50);

        let events = env.events().all();
        assert!(!events.is_empty(), "expected mint event");
    }

    #[test]
    fn transfer_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        client.init(&admin);
        client.mint(&sender, &100);
        client.transfer(&sender, &recipient, &40);

        let events = env.events().all();
        // mint + transfer = at least 2 events
        assert!(events.len() >= 2);
    }

    #[test]
    fn balance_defaults_to_zero_for_unknown_account() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.init(&admin);

        let unknown = Address::generate(&env);
        assert_eq!(client.balance(&unknown), 0);
    }

    #[test]
    fn transfer_fails_on_insufficient_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        client.init(&admin);
        client.mint(&sender, &10);

        // Attempting to transfer more than balance should fail
        let result = client.try_transfer(&sender, &recipient, &100);
        assert!(result.is_err(), "expected transfer to fail with insufficient balance");
    }

    #[test]
    fn multiple_mints_accumulate_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        client.init(&admin);
        client.mint(&recipient, &100);
        client.mint(&recipient, &50);

        assert_eq!(client.balance(&recipient), 150);
    }

    #[test]
    fn storage_is_isolated_per_account() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFixture);
        let client = TokenFixtureClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.init(&admin);
        client.mint(&alice, &300);

        // Bob's balance must remain zero
        assert_eq!(client.balance(&bob), 0);
        assert_eq!(client.balance(&alice), 300);
    }
}
