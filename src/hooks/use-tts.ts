"use client"

import { useState, useCallback, useEffect } from "react"

export function useTTS() {
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [supported, setSupported] = useState(true)
    const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)

    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const loadVoices = () => {
                const voices = window.speechSynthesis.getVoices()
                // Prefer a Chinese mainland voice
                const zhVoice = voices.find(v => v.lang === 'zh-CN') || voices.find(v => v.lang.startsWith('zh'))
                if (zhVoice) {
                    setVoice(zhVoice)
                }
            }
            loadVoices()
            window.speechSynthesis.onvoiceschanged = loadVoices
        } else {
            setSupported(false)
        }
    }, [])

    const speak = useCallback((text: string) => {
        if (!supported) return

        // Stop any current speech
        window.speechSynthesis.cancel()

        const cleanText = text.replace(/<[^>]*>?/gm, '').trim()
        if (!cleanText) return

        const utterance = new SpeechSynthesisUtterance(cleanText)
        if (voice) {
            utterance.voice = voice
            utterance.lang = voice.lang
        } else {
            utterance.lang = 'zh-CN'
        }

        utterance.rate = 0.9 // slightly slower for language learning
        utterance.onstart = () => setIsSpeaking(true)
        utterance.onend = () => setIsSpeaking(false)
        utterance.onerror = () => setIsSpeaking(false)

        window.speechSynthesis.speak(utterance)
    }, [supported, voice])

    const stop = useCallback(() => {
        if (supported) {
            window.speechSynthesis.cancel()
            setIsSpeaking(false)
        }
    }, [supported])

    return { speak, stop, isSpeaking, supported }
}
