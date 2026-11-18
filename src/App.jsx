import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import Intro from './assets/components/pages/Intro'
import Home from './assets/components/pages/home'

function App() {
      return (
            <BrowserRouter>
                  <Routes>
                        <Route path="/" element={<Intro />} />
                        <Route path="/home" element={<Home />} />
                  </Routes>
            </BrowserRouter>
      )
}
export default App;