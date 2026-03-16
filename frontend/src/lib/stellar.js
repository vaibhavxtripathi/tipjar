import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, getPublicKey, signTransaction } from '@stellar/freighter-api'

const CONTRACT_ID      = (import.meta.env.VITE_CONTRACT_ID || '').trim()
const XLM_TOKEN        = (import.meta.env.VITE_XLM_TOKEN || '').trim()
const CREATOR_ADDRESS  = import.meta.env.VITE_CREATOR_ADDRESS
const NET              = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'
const RPC_URL          = import.meta.env.VITE_SOROBAN_RPC_URL    || 'https://soroban-testnet.stellar.org'
const DUMMY            = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)

export async function connectWallet() {
  if (!(await isConnected())) throw new Error('Freighter not found. Install the extension.')
  return getPublicKey()
}

async function sendTx(publicKey, op) {
  const account = await rpc.getAccount(publicKey)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(60).build()
  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const signedXdr = await signTransaction(prepared.toXDR(), { networkPassphrase: NET, network: 'TESTNET' })
  const signed = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NET)
  const result = await rpc.sendTransaction(signed)
  return pollTx(result.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(hash)
    if (r.status === 'SUCCESS') return hash
    if (r.status === 'FAILED')  throw new Error('Transaction failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Transaction timed out')
}

async function readContract(op) {
  const dummy = new StellarSdk.Account(DUMMY, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(30).build()
  const sim = await rpc.simulateTransaction(tx)
  return StellarSdk.scValToNative(sim.result.retval)
}

const tc = () => new StellarSdk.Contract(CONTRACT_ID)

export async function setupJar(owner, name, bio) {
  return sendTx(owner, tc().call(
    'setup',
    StellarSdk.Address.fromString(owner).toScVal(),
    StellarSdk.xdr.ScVal.scvString(name),
    StellarSdk.xdr.ScVal.scvString(bio),
  ))
}

export async function sendTip(tipper, amountXlm, message) {
  const stroops = Math.ceil(amountXlm * 10_000_000)
  // approve first
  await sendTx(tipper, new StellarSdk.Contract(XLM_TOKEN).call(
    'approve',
    StellarSdk.Address.fromString(tipper).toScVal(),
    StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
    new StellarSdk.XdrLargeInt('i128', BigInt(stroops)).toI128(),
    StellarSdk.xdr.ScVal.scvU32(3_110_400),
  ))
  return sendTx(tipper, tc().call(
    'tip',
    StellarSdk.Address.fromString(tipper).toScVal(),
    new StellarSdk.XdrLargeInt('i128', BigInt(stroops)).toI128(),
    StellarSdk.xdr.ScVal.scvString(message),
    StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
  ))
}

export async function withdrawTips(owner) {
  return sendTx(owner, tc().call(
    'withdraw',
    StellarSdk.Address.fromString(owner).toScVal(),
    StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
  ))
}

export async function getProfile() {
  try { return await readContract(tc().call('get_profile')) }
  catch { return null }
}

export async function getTips() {
  try {
    const tips = await readContract(tc().call('get_tips'))
    return Array.isArray(tips) ? [...tips].reverse() : []
  } catch { return [] }
}

export const xlm   = s => (Number(s) / 10_000_000).toFixed(2)
export const short = a => a ? `${a.toString().slice(0, 5)}…${a.toString().slice(-4)}` : '—'
export { CONTRACT_ID, CREATOR_ADDRESS }
