import { useState, useEffect, useRef } from 'react'
import {
  connectWallet, setupJar, sendTip, withdrawTips,
  getProfile, getTips, xlm, short, CONTRACT_ID, CREATOR_ADDRESS,
} from './lib/stellar'

const AMOUNTS = ['0.5', '1', '2', '5', '10']
const EMOJIS  = ['☕', '🍕', '🎉', '💎', '🚀']

// ── Confetti burst ─────────────────────────────────────────────────────────
function Confetti({ active }) {
  const particles = useRef(
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: 40 + Math.random() * 20,
      rot: Math.random() * 360,
      scale: 0.6 + Math.random() * 0.8,
      color: ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b'][i % 5],
      dur: 0.8 + Math.random() * 0.6,
      delay: Math.random() * 0.3,
    }))
  )
  if (!active) return null
  return (
    <div className="confetti-wrap" aria-hidden>
      {particles.current.map(p => (
        <div key={p.id} className="confetti-particle"
          style={{
            left: `${p.x}%`,
            background: p.color,
            transform: `rotate(${p.rot}deg) scale(${p.scale})`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

// ── Tip feed item ──────────────────────────────────────────────────────────
function TipItem({ tip, idx }) {
  const emoji  = EMOJIS[idx % EMOJIS.length]
  const amount = xlm(tip.amount)
  const isLarge = Number(tip.amount) >= 5_000_000

  return (
    <div className={`tip-item ${isLarge ? 'tip-large' : ''}`}
      style={{ animationDelay: `${idx * 0.04}s` }}>
      <div className="ti-left">
        <div className="ti-emoji">{emoji}</div>
        <div className="ti-info">
          <div className="ti-from">{short(tip.tipper)}</div>
          {tip.message && <div className="ti-msg">"{tip.message}"</div>}
        </div>
      </div>
      <div className={`ti-amount ${isLarge ? 'amt-large' : ''}`}>
        +{amount} XLM
      </div>
    </div>
  )
}

// ── Setup form ─────────────────────────────────────────────────────────────
function SetupForm({ wallet, onSetup }) {
  const [name, setName] = useState('')
  const [bio,  setBio]  = useState('')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await setupJar(wallet, name, bio)
      onSetup()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-icon">🪴</div>
        <h2 className="setup-title">Set Up Your Tip Jar</h2>
        <p className="setup-sub">This jar is deployed and ready. Give it your name and a short bio.</p>
        <form onSubmit={handleSubmit} className="setup-form">
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Your name or handle" maxLength={60}
            required disabled={busy} className="setup-input" />
          <textarea value={bio} onChange={e => setBio(e.target.value)}
            placeholder="Tell supporters what you do…" maxLength={160}
            rows={3} disabled={busy} className="setup-textarea" />
          {err && <p className="setup-err">{err}</p>}
          <button type="submit" className="btn-setup" disabled={busy || !name}>
            {busy ? 'Saving…' : 'Activate Jar'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,     setWallet]     = useState(null)
  const [profile,    setProfile]    = useState(null)
  const [tips,       setTips]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [amount,     setAmount]     = useState('1')
  const [customAmt,  setCustomAmt]  = useState('')
  const [message,    setMessage]    = useState('')
  const [busy,       setBusy]       = useState(false)
  const [toast,      setToast]      = useState(null)
  const [confetti,   setConfetti]   = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [p, t] = await Promise.all([getProfile(), getTips()])
      if (p) { setProfile(p); setNeedsSetup(false) }
      else   { setNeedsSetup(true) }
      setTips(t)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleConnect = async () => {
    try { setWallet(await connectWallet()) }
    catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleTip = async (e) => {
    e.preventDefault()
    if (!wallet) return
    const tipAmount = customAmt || amount
    setBusy(true)
    try {
      const hash = await sendTip(wallet, parseFloat(tipAmount), message)
      showToast(true, `${tipAmount} XLM tip sent! 🎉`, hash)
      setConfetti(true)
      setTimeout(() => setConfetti(false), 2000)
      setMessage('')
      setCustomAmt('')
      loadData()
    } catch (e) { showToast(false, e.message) }
    finally { setBusy(false) }
  }

  const handleWithdraw = async () => {
    if (!wallet) return
    setBusy(true)
    try {
      const hash = await withdrawTips(wallet)
      showToast(true, `Withdrew ${xlm(profile.balance)} XLM!`, hash)
      loadData()
    } catch (e) { showToast(false, e.message) }
    finally { setBusy(false) }
  }

  const isOwner   = wallet && profile?.owner?.toString() === wallet
  const tipAmount = customAmt || amount

  if (loading) return (
    <div className="loading-screen">
      <div className="ls-jar">🫙</div>
      <div className="ls-text">Loading jar…</div>
    </div>
  )

  if (needsSetup && wallet && CREATOR_ADDRESS === wallet) {
    return <SetupForm wallet={wallet} onSetup={loadData} />
  }

  return (
    <div className="app">
      <Confetti active={confetti} />

      {/* ── Gradient bg ── */}
      <div className="bg-gradient" />

      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">🫙 TipJar</div>
        <div className="header-right">
          <a className="header-contract"
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank" rel="noreferrer">
            contract ↗
          </a>
          {wallet
            ? <div className="wallet-chip"><span className="wdot" />{short(wallet)}</div>
            : <button className="btn-connect" onClick={handleConnect}>Connect</button>
          }
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
          <span>{toast.msg}</span>
          {toast.hash && (
            <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer" className="toast-link">TX ↗</a>
          )}
        </div>
      )}

      <main className="main">
        {/* ── Creator card ── */}
        <div className="creator-card">
          <div className="cc-avatar">
            {profile?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="cc-info">
            <h1 className="cc-name">{profile?.name || 'Unnamed Creator'}</h1>
            {profile?.bio && <p className="cc-bio">{profile.bio}</p>}
            <div className="cc-stats">
              <div className="cc-stat">
                <span className="ccs-n">{xlm(profile?.total_tips || 0)}</span>
                <span className="ccs-l">XLM received</span>
              </div>
              <div className="cc-stat-div" />
              <div className="cc-stat">
                <span className="ccs-n">{profile?.tip_count?.toString() || '0'}</span>
                <span className="ccs-l">supporters</span>
              </div>
            </div>
          </div>

          {isOwner && Number(profile?.balance) > 0 && (
            <button className="btn-withdraw" disabled={busy} onClick={handleWithdraw}>
              {busy ? '…' : `Withdraw ${xlm(profile.balance)} XLM`}
            </button>
          )}
        </div>

        {/* ── Tip form ── */}
        <form className="tip-form" onSubmit={handleTip}>
          <div className="tf-title">Send a tip ☕</div>

          <div className="amount-grid">
            {AMOUNTS.map((a, i) => (
              <button
                key={a} type="button"
                className={`amt-btn ${amount === a && !customAmt ? 'amt-active' : ''}`}
                onClick={() => { setAmount(a); setCustomAmt('') }}
              >
                <span className="amt-emoji">{EMOJIS[i]}</span>
                <span className="amt-val">{a} XLM</span>
              </button>
            ))}
          </div>

          <div className="custom-row">
            <input
              type="number" min="0.1" step="0.1"
              value={customAmt}
              onChange={e => setCustomAmt(e.target.value)}
              placeholder="Custom amount…"
              className="custom-input"
              disabled={busy}
            />
            <span className="custom-unit">XLM</span>
          </div>

          <textarea
            className="msg-input"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Leave a message… (optional)"
            maxLength={120}
            rows={2}
            disabled={busy}
          />
          <span className="msg-chars">{message.length}/120</span>

          <button type="submit" className="btn-tip"
            disabled={!wallet || busy || !tipAmount}>
            {!wallet
              ? <span onClick={(e) => { e.preventDefault(); handleConnect() }}>Connect to tip</span>
              : busy
                ? 'Sending…'
                : `Send ${tipAmount} XLM ☕`}
          </button>

          {!wallet && (
            <button type="button" className="btn-connect-lg" onClick={handleConnect}>
              Connect Freighter Wallet
            </button>
          )}
        </form>

        {/* ── Tip feed ── */}
        {tips.length > 0 && (
          <div className="tip-feed">
            <div className="feed-title">Recent supporters</div>
            <div className="feed-list">
              {tips.slice(0, 20).map((t, i) => (
                <TipItem key={i} tip={t} idx={i} />
              ))}
            </div>
          </div>
        )}

        {tips.length === 0 && !loading && (
          <div className="empty-feed">
            <div className="ef-icon">🌱</div>
            <p>Be the first to send a tip!</p>
          </div>
        )}
      </main>

      <footer className="footer">
        Powered by Stellar · Soroban Smart Contracts
      </footer>
    </div>
  )
}
