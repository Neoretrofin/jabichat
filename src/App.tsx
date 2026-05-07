import { useEffect } from 'react'
// HashRouter is used so that GitHub Pages serves a single index.html and
// React Router handles all paths client-side via the URL fragment. Avoids
// 404s on hard reload of deep routes without server-side rewrites.
import { HashRouter as BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useNostrStore } from './store/nostrStore'
import { useThemeStore } from './store/themeStore'
import NDKProvider from './components/NDKProvider'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ChatsPage from './pages/ChatsPage'
import ChatPage from './pages/ChatPage'
import GroupChatPage from './pages/GroupChatPage'
import CallPage from './pages/CallPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  const { nsec } = useNostrStore()
  const theme = useThemeStore((s) => s.theme)

  // Apply theme at the root so the LoginPage (rendered before Layout) is
  // also styled correctly for returning users with a saved preference.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <NDKProvider>
      <BrowserRouter>
        <Routes>
          {!nsec ? (
            <Route path="*" element={<LoginPage />} />
          ) : (
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/chats" replace />} />
              <Route path="chats" element={<ChatsPage />} />
              <Route path="chats/:pubkey" element={<ChatPage />} />
              <Route path="groups/:channelId" element={<GroupChatPage />} />
              <Route path="call/:pubkey" element={<CallPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="*" element={<Navigate to="/chats" replace />} />
            </Route>
          )}
        </Routes>
      </BrowserRouter>
    </NDKProvider>
  )
}
