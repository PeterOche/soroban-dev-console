


#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

#[contracttype]
pub enum DataKey {
    EmissionCount,
}

#[contract]
pub struct EventFixture;

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env};

#[contracttype]
pub enum DataKey {
    Count,
}

#[contract]
pub struct CounterFixture;

#[contractimpl]
impl CounterFixture {
    pub fn get(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Count)
            .unwrap_or(0)
    }

    pub fn set(env: Env, value: u32) {
        env.storage().persistent().set(&DataKey::Count, &value);
        env.events().publish((symbol_short!("set"),), value);
    }

    pub fn increment(env: Env) -> u32 {
        let next = Self::get(env.clone()) + 1;
        env.storage().persistent().set(&DataKey::Count, &next);
        env.events().publish((symbol_short!("inc"),), next);
        next
    }

    pub fn reset(env: Env) {
        env.storage().persistent().set(&DataKey::Count, &0u32);
        env.events().publish((symbol_short!("reset"),), ());
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Events, Env};

    #[test]
    fn counter_defaults_to_zero() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterFixture);
        let client = CounterFixtureClient::new(&env, &contract_id);

        assert_eq!(client.get(), 0);
    }

    #[test]
    fn counter_can_be_set_and_incremented() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterFixture);
        let client = CounterFixtureClient::new(&env, &contract_id);

        client.set(&7);
        assert_eq!(client.get(), 7);
        assert_eq!(client.increment(), 8);
        assert_eq!(client.get(), 8);
    }

    #[test]
    fn set_emits_event() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterFixture);
        let client = CounterFixtureClient::new(&env, &contract_id);

        client.set(&42);

        let events = env.events().all();
        assert!(!events.is_empty(), "expected at least one event after set");
    }

    #[test]
    fn increment_emits_event() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterFixture);
        let client = CounterFixtureClient::new(&env, &contract_id);

        client.increment();

        let events = env.events().all();
        assert!(!events.is_empty(), "expected at least one event after increment");
    }

    #[test]
    fn reset_clears_storage_and_emits_event() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterFixture);
        let client = CounterFixtureClient::new(&env, &contract_id);

        client.set(&99);
        assert_eq!(client.get(), 99);

        client.reset();
        assert_eq!(client.get(), 0);

        let events = env.events().all();
        // set + reset = at least 2 events
        assert!(events.len() >= 2);
    }

    #[test]
    fn multiple_increments_accumulate() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterFixture);
        let client = CounterFixtureClient::new(&env, &contract_id);

        for i in 1u32..=5 {
            assert_eq!(client.increment(), i);
        }
        assert_eq!(client.get(), 5);
    }

    #[test]
    fn storage_persists_across_calls() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterFixture);
        let client = CounterFixtureClient::new(&env, &contract_id);

        client.set(&10);
        // Simulate separate call — value must still be 10
        assert_eq!(client.get(), 10);
        client.increment();
        assert_eq!(client.get(), 11);
    }
}


#[contractimpl]
impl EventFixture {
    pub fn emit_message(env: Env, sender: Address, topic: Symbol, value: i128) {
        sender.require_auth();

        let count = Self::event_count(env.clone()) + 1;
        env.storage().persistent().set(&DataKey::EmissionCount, &count);
        env.events()
            .publish((Symbol::new(&env, "message"), sender, topic), value);
    }

    pub fn emit_checkpoint(env: Env, checkpoint: u32) {
        let count = Self::event_count(env.clone()) + 1;
        env.storage().persistent().set(&DataKey::EmissionCount, &count);
        env.events()
            .publish((Symbol::new(&env, "checkpoint"),), checkpoint);
    }

    pub fn event_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::EmissionCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

    #[test]
    fn event_fixture_tracks_emissions() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, EventFixture);
        let client = EventFixtureClient::new(&env, &contract_id);
        let sender = Address::generate(&env);

        client.emit_message(&sender, &Symbol::new(&env, "alpha"), &12);
        client.emit_checkpoint(&5);

        assert_eq!(client.event_count(), 2);
    }

    #[test]
    fn event_fixture_starts_at_zero() {
        let env = Env::default();
        let contract_id = env.register_contract(None, EventFixture);
        let client = EventFixtureClient::new(&env, &contract_id);

        assert_eq!(client.event_count(), 0);
    }
}
