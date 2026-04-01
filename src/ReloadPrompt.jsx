import React from 'react';
// This is the magic virtual module provided by vite-plugin-pwa
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered:', r);
        },
        onRegisterError(error) {
            console.error('SW Registration Error:', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    // If there's no update and it's not newly offline-ready, render nothing
    if (!offlineReady && !needRefresh) return null;

    return (
        <div style={styles.container}>
            <div style={styles.message}>
                {offlineReady
                    ? <span>App is ready to work offline!</span>
                    : <span>New update available! Click reload to apply.</span>}
            </div>
            <div style={styles.buttonContainer}>
                {needRefresh && (
                    <button style={styles.button} onClick={() => updateServiceWorker(true)}>
                        Reload App
                    </button>
                )}
                <button style={styles.button} onClick={() => close()}>
                    Close
                </button>
            </div>
        </div>
    );
}

// Basic styling to make it look like a pop-up in the bottom right
const styles = {
    container: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: '#333',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        fontFamily: 'sans-serif',
    },
    message: {
        fontSize: '14px',
        margin: 0,
    },
    buttonContainer: {
        display: 'flex',
        gap: '8px',
    },
    button: {
        padding: '6px 12px',
        border: '1px solid #555',
        borderRadius: '4px',
        backgroundColor: '#555',
        color: 'white',
        cursor: 'pointer',
        fontWeight: 'bold',
    }
};

export default ReloadPrompt;