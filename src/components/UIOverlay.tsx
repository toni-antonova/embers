import { useState, useEffect, useRef } from 'react';
import { AudioEngine } from '../services/AudioEngine';

interface UIOverlayProps {
    audioEngine: AudioEngine;
}

export function UIOverlay({ audioEngine }: UIOverlayProps) {
    const [isListening, setIsListening] = useState(false);
    const [features, setFeatures] = useState(audioEngine.getFeatures());
    const rafRef = useRef<number>(0);

    const toggleMic = async () => {
        if (isListening) {
            audioEngine.stop();
            setIsListening(false);
        } else {
            await audioEngine.start();
            setIsListening(true);
        }
    };

    useEffect(() => {
        const loop = () => {
            if (isListening) {
                setFeatures({ ...audioEngine.getFeatures() });
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(rafRef.current!);
    }, [audioEngine, isListening]);

    return (
        <div className="ui-overlay">
            <div className="debug-panel">
                <div className="debug-row">
                    <span>Energy</span>
                    <div className="debug-bar"><div className="debug-fill" style={{ width: `${features.energy * 100}%` }}></div></div>
                </div>
                <div className="debug-row">
                    <span>Tension</span>
                    <div className="debug-bar"><div className="debug-fill" style={{ width: `${features.tension * 100}%` }}></div></div>
                </div>
                <div className="debug-row">
                    <span>Urgency</span>
                    <div className="debug-bar"><div className="debug-fill" style={{ width: `${features.urgency * 100}%` }}></div></div>
                </div>
                <div className="debug-row">
                    <span>Breath</span>
                    <div className="debug-bar"><div className="debug-fill" style={{ width: `${features.breathiness * 100}%` }}></div></div>
                </div>
            </div>

            <button
                className={`mic-button ${isListening ? 'active' : ''}`}
                onClick={toggleMic}
            >
                {isListening ? 'Stop Listening' : 'Start Listening'}
            </button>
        </div>
    );
}
