import { Outlet, NavLink } from 'react-router-dom'
import { MessageCircle, User } from 'lucide-react'
import { useSignaling } from '../hooks/useSignaling'
import { useDMSubscription } from '../hooks/useDMSubscription'
import { useContactMetadata } from '../hooks/useContactMetadata'
import { useAllGroupsSubscription } from '../hooks/useAllGroupsSubscription'
import { useCallController } from '../hooks/useCallController'
import IncomingCallModal from './IncomingCallModal'
import FloatingCallIndicator from './FloatingCallIndicator'

const navItems = [
  { to: '/chats', icon: MessageCircle, label: 'Чаты' },
  { to: '/profile', icon: User, label: 'Профиль' },
]

export default function Layout() {
  // Global subscriptions — must run regardless of which page is active
  useSignaling()
  useDMSubscription()
  useContactMetadata()
  useAllGroupsSubscription()
  useCallController()

  return (
    <div className="flex flex-col min-h-svh bg-swamp-dark">
      <header className="px-4 py-3 border-b border-frog-dark/30 flex items-center gap-2">
        <span className="text-2xl">🐸</span>
        <h1 className="text-xl font-bold text-lily-green tracking-wide">jabichat</h1>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <IncomingCallModal />
      <FloatingCallIndicator />

      <nav className="fixed bottom-0 left-0 right-0 bg-swamp-darker border-t border-frog-dark/30 safe-area-inset-bottom">
        <div className="flex justify-around py-2 max-w-lg mx-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-colors ${
                  isActive
                    ? 'text-frog-skin bg-frog-skin/10'
                    : 'text-lily-green/60 hover:text-lily-green'
                }`
              }
            >
              <Icon size={22} />
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
