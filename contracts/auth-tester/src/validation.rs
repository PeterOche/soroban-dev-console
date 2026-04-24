#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct AuthTester;


#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

#[contracttype]
pub enum DataKey {
    EmissionCount,
}

#[contract]
pub struct EventFixture;

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

#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidInput = 1,
    Unauthorized = 2,
    Overflow = 3,
}

#[contract]
pub struct ErrorTriggerContract;

#[contractimpl]
impl ErrorTriggerContract {
    pub fn trigger_panic(_env: Env) {
        panic!("intentional panic for diagnostic testing");
    }

    pub fn trigger_assert(_env: Env, value: u32) {
        assert!(value == 0, "assertion failed: value must be zero");
    }

    pub fn trigger_custom_error(_env: Env, code: u32) -> Result<u32, Error> {
        match code {
            1 => Err(Error::InvalidInput),
            2 => Err(Error::Unauthorized),
            3 => Err(Error::Overflow),
            _ => Ok(code),
        }
    }
}


#[contractimpl]
impl AuthTester {
    /// A function that requires authorization from two different addresses.
    /// This is useful for testing how the UI handles multiple required authorizations.
    pub fn multi_auth(_env: Env, user1: Address, user2: Address) {
        user1.require_auth();
        user2.require_auth();
    }
}
