import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode is intentionally NOT used here. Its dev-time double-invoke of
// effects breaks WebRTC initialization in CallPage: setup #1 starts the
// async pipeline (getUserMedia → createOffer → sendSignal), cleanup cancels
// it before sendSignal is reached, and setup #2 is blocked by the
// in-progress guard. Net effect: the call-offer is never published and the
// callee never sees the incoming call. WebRTC sessions are stateful side
// effects and don't lend themselves to idempotent setup.
createRoot(document.getElementById('root')!).render(<App />)
