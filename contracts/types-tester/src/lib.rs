#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NestedData {
    pub id: u64,
    pub name: soroban_sdk::String,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComplexTuple {
    pub address: Address,
    pub amount: i128,
    pub metadata: soroban_sdk::String,
    pub nested: NestedData,
}

#[contract]
pub struct TypesTester;

#[contractimpl]
impl TypesTester {
    /// Test function with nested Vec<Vec<u64>>
    pub fn test_nested_vec(env: Env, data: Vec<Vec<u64>>) -> Vec<Vec<u64>> {
        data
    }

    /// Test function with complex nested tuples
    pub fn test_complex_tuple(
        env: Env,
        tuple_data: ComplexTuple,
        count: u32,
    ) -> ComplexTuple {
        tuple_data
    }

    /// Test function with BytesN<32> and Address
    pub fn test_bytes_and_address(
        env: Env,
        hash: BytesN<32>,
        addr: Address,
    ) -> (BytesN<32>, Address) {
        (hash, addr)
    }

    /// Test function with multiple complex types combined
    pub fn test_all_types(
        env: Env,
        nested_vecs: Vec<Vec<u64>>,
        tuple_data: ComplexTuple,
        hash: BytesN<32>,
        addresses: Vec<Address>,
    ) -> (Vec<Vec<u64>>, ComplexTuple, BytesN<32>, Vec<Address>) {
        (nested_vecs, tuple_data, hash, addresses)
    }

    /// Test function with Vec of complex structs
    pub fn test_vec_of_structs(env: Env, items: Vec<ComplexTuple>) -> Vec<ComplexTuple> {
        items
    }

    /// Test function with optional types
    pub fn test_optional(
        env: Env,
        maybe_value: Option<u64>,
        maybe_address: Option<Address>,
    ) -> (Option<u64>, Option<Address>) {
        (maybe_value, maybe_address)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_nested_vec() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TypesTester);
        let client = TypesTesterClient::new(&env, &contract_id);

        let mut outer = Vec::new(&env);
        let mut inner1 = Vec::new(&env);
        inner1.push_back(1);
        inner1.push_back(2);
        outer.push_back(inner1);

        let result = client.test_nested_vec(&outer);
        assert_eq!(result, outer);
    }

    #[test]
    fn test_bytes_and_address() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TypesTester);
        let client = TypesTesterClient::new(&env, &contract_id);

        let hash = BytesN::from_array(&env, &[0u8; 32]);
        let addr = Address::generate(&env);

        let (result_hash, result_addr) = client.test_bytes_and_address(&hash, &addr);
        assert_eq!(result_hash, hash);
        assert_eq!(result_addr, addr);
    }
}
