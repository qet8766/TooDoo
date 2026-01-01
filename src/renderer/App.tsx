import { Navigate, Route, Routes } from 'react-router-dom'
import TooDooOverlay from './pages/Overlay'
import QuickAdd from './pages/QuickAdd'

const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/toodoo" replace />} />
    <Route path="/toodoo" element={<TooDooOverlay />} />
    <Route path="/quick-add" element={<QuickAdd />} />
    <Route path="*" element={<Navigate to="/toodoo" replace />} />
  </Routes>
)

export default App
