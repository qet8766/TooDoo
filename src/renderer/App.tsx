import { Navigate, Route, Routes } from 'react-router-dom'
import TooDooOverlay from './pages/Overlay'
import QuickAdd from './pages/QuickAdd'
import SetupPage from './pages/Setup'
import { NotetankOverlay, NoteEditor } from './pages/Notetank'

const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/toodoo" replace />} />
    <Route path="/toodoo" element={<TooDooOverlay />} />
    <Route path="/quick-add" element={<QuickAdd />} />
    <Route path="/setup" element={<SetupPage />} />
    <Route path="/notetank" element={<NotetankOverlay />} />
    <Route path="/note-editor" element={<NoteEditor />} />
    <Route path="*" element={<Navigate to="/toodoo" replace />} />
  </Routes>
)

export default App
