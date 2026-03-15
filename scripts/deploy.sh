#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}TIPJAR — DEPLOY${NC}"

stellar keys generate --global creator --network testnet 2>/dev/null || true
stellar keys generate --global tipper  --network testnet 2>/dev/null || true
stellar keys fund creator --network testnet
stellar keys fund tipper  --network testnet
CREATOR=$(stellar keys address creator)
TIPPER=$(stellar keys address tipper)
XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)
echo -e "${GREEN}✓ Creator: ${CREATOR}${NC}"
echo -e "${GREEN}✓ Tipper : ${TIPPER}${NC}"

cd contract
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/tipjar.wasm"
cd ..

WASM_HASH=$(stellar contract upload --network testnet --source creator --wasm contract/${WASM})
CONTRACT_ID=$(stellar contract deploy --network testnet --source creator --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ CONTRACT_ID: ${CONTRACT_ID}${NC}"

# Setup creator profile
stellar contract invoke --network testnet --source creator --id ${CONTRACT_ID} \
  -- setup \
  --owner ${CREATOR} \
  --name '"Stellar Developer"' \
  --bio '"Building the future of finance on Stellar. Open-source contributor and Soroban educator."' 2>&1 || true

# Approve XLM for tipper
stellar contract invoke --network testnet --source tipper --id ${XLM_TOKEN} \
  -- approve \
  --from ${TIPPER} \
  --spender ${CONTRACT_ID} \
  --amount 50000000 \
  --expiration_ledger 99999999 2>&1 || true

# Proof tip
TX_RESULT=$(stellar contract invoke \
  --network testnet --source tipper --id ${CONTRACT_ID} \
  -- tip \
  --tipper ${TIPPER} \
  --amount 5000000 \
  --message '"Great work on the Soroban tutorials! Keep building."' \
  --xlm_token ${XLM_TOKEN} 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)
echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_XLM_TOKEN=${XLM_TOKEN}
VITE_CREATOR_ADDRESS=${CREATOR}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${CYAN}CONTRACT  : ${CONTRACT_ID}${NC}"
echo -e "${CYAN}PROOF TX  : ${TX_HASH}${NC}"
echo -e "${CYAN}EXPLORER  : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}${NC}"
echo "Next: cd frontend && npm install && npm run dev"
