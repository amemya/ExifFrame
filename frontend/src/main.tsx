import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'
import SettingsWindow from './SettingsWindow'

const container = document.getElementById('root')

const root = createRoot(container!)

if (window.location.pathname === '/settings') {
    root.render(
        <React.StrictMode>
            <SettingsWindow />
        </React.StrictMode>
    )
} else {
    root.render(
        <React.StrictMode>
            <App/>
        </React.StrictMode>
    )
}
