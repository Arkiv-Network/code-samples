mod utils;
use std::env;
use std::process;
use dirs::config_dir;
use golem_base_sdk::entity::{Create, EntityResult}; //, , Extend, Update};
use golem_base_sdk::{
    Annotation, GolemBaseClient, PrivateKeySigner, Url
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    println!("Hello, world!");

    let rand_num = utils::generate_number();

    println!("Here's a random number: {}", rand_num);

    let password = match env::var("GOLEMDB_PASS") {
        Ok(val) => val,
        Err(e) => {
            eprintln!("Error: The GOLEMDB_PASS environment variable is not set.");
            eprintln!("Details: {}", e);
            process::exit(1);
        }
    };

    let rpc_url = match env::var("GOLEM_RPC") {
        Ok(val) => val,
        Err(e) => {
            eprintln!("Error: The GOLEM_RPC environment variable is not set.");
            eprintln!("Details: {}", e);
            process::exit(1);
        }
    };

    println!("Getting keypath...");

    let keypath = config_dir()
        .ok_or("Failed to get config directory")?
        .join("golembase")
        .join("wallet.json");

    println!("Keypath is {:?}", keypath);

    let signer = PrivateKeySigner::decrypt_keystore(keypath, password.trim_end())?;
    println!(
        "Successfully decrypted keystore with address: {}",
        signer.address()
    );

    println!("Connecting...");
    
    let url = Url::parse(&rpc_url).unwrap();
    let client = GolemBaseClient::builder()
        .wallet(signer)
        .rpc_url(url)
        .build();

    println!("Fetching owner address...");
    let owner_address = client.get_owner_address();
    println!("Owner address: {}", owner_address);


    let creates = vec![
        Create {
            data: "foo".into(),
            btl: 25,
            string_annotations: vec![Annotation::new("key", "foo")],
            numeric_annotations: vec![Annotation::new("ix", 1u64)],
        },
    ];

    let receipts: Vec<EntityResult> = client.create_entities(creates).await?;
    println!("Created entities: {:?}", receipts);

    Ok(())
}