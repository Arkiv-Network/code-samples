import asyncio
import json
from arkiv import Arkiv
from web3 import HTTPProvider
import anyio
from pathlib import Path
from xdg import BaseDirectory

from arkiv.account import NamedAccount
from arkiv.types import Annotations
from arkiv.module import ArkivModule
from arkiv.provider import ProviderBuilder

WALLET_PATH = Path(BaseDirectory.xdg_config_home) / "golembase" / "wallet.json"

async def run_example():
    account = None
    async with await anyio.open_file(WALLET_PATH, "r", ) as f:
        keyfile_json = json.loads(await f.read())
        account = NamedAccount.from_wallet("arkiv_wallet", keyfile_json, "abc123")

    # Two approaches: client.arkiv to align with client.eth etc.
    #   Or create an ArkivModule for direct access to helper methods
    #   See end of this code for example that uses client.eth.

    provider = ProviderBuilder().localhost().build()
    client = Arkiv(provider, account=account)
    module = ArkivModule(client)

    payload = b"Hello Fred Finnigan!!"
    annots: Annotations = Annotations({'app': 'test-app-v1', 'name':'Fred Finnigan', 'fav_num': 10, 'hired': 2020})
    btl = 60

    result = module.create_entity(payload=payload, annotations=annots, btl=btl)
    print(result)
    entity_key = result[0]

    # See if entity exists

    print(module.entity_exists(entity_key))

    # Get just the annotations (we can get payload (1), metadata (2), annotations (4) as bitfield/sum)
    # (Note: Matthias has metadata(2) and annotations(4) backwards compared to his comments; 
    # I'll let him know later when he's ready for feedback/testing)

    result = module.get_entity(entity_key, 2)
    print(result.annotations)


def main() -> None:
    asyncio.run(run_example())

if __name__ == "__main__":
    main()

# Old
# import asyncio
# import json

# from arkiv import Arkiv
# from web3 import HTTPProvider
# import anyio
# from arkiv.account import NamedAccount
# from arkiv.types import Annotations, CreateOp, Operations
# from arkiv.utils import to_tx_params
# # from arkiv.exceptions import AccountNameException
# # from eth_account import Account

# WALLET_PATH = '/home/freckleface/.config/golembase/wallet.json'

# async def run_example():
#     account = None
#     async with await anyio.open_file(WALLET_PATH, "r", ) as f:
#         keyfile_json = json.loads(await f.read())
#         # private_key = Account.decrypt(keyfile_json, "abc123")
#         account = NamedAccount.from_wallet("arkiv_wallet", keyfile_json, "abc123")
#     print(account.address)

#     provider = HTTPProvider('http://localhost:8545')
#     client = Arkiv(provider, account=account)
#     print(dir(client))
#     print(client.is_connected())

#     payload = b"Hello Freckleface from new client!!"
#     annots: Annotations = Annotations({'app': 'test-app-v1', 'name':'Fred Finnigan', 'fav_num': 10, 'hired': 2020})
#     btl = 60
#     create_op = CreateOp(payload=payload, annotations=annots, btl=btl)

#     operations = Operations(creates=[create_op])
#     tx_params = None
#     tx_params = to_tx_params(operations, tx_params)
#     tx_hash = client.eth.send_transaction(tx_params) 


#     print(tx_hash.hex())
