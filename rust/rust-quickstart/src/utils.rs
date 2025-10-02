pub fn generate_number() -> u32 {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    rng.gen_range(1..101)
}